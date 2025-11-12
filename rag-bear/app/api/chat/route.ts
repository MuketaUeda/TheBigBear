import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai"
import { AstraDBVectorStore } from "@langchain/community/vectorstores/astradb"
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
import { createRetrievalChain } from "langchain/chains/retrieval"
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever"
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { HumanMessage, AIMessage, SystemMessage} from "@langchain/core/messages"
// import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression"
// import { BaseRetriever } from "@langchain/core/retrievers";
// import { CohereRerank } from "@langchain/cohere"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

const {
    ASTRA_DB_TOKEN,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION,
    OPENAI_API_KEY,
    // COHERE_API_KEY, // Re-ranking desabilitado temporariamente
} = process.env;

const MEMORY_CONFIG = {
    MAX_MESSAGES: 8,
    MAX_CHARS: 2000,
    MIN_MESSAGES: 2,
};

// schema to extract filters
const FilterExtractionSchema = z.object({
    categories: z.array(z.enum([       "geral",
        "ativacao", 
        "atracoes",
        "bar",
        "decoracao",
        "estruturas",
        "financeiro",
        "liberacao",
        "marketing",
        "patrocinio"
    ])).describe("Lista de categorias relevantes para a pergunta. Pode ser vazia se não houver categoria específica."),
    year: z.string().nullable().describe("Ano mencionado na pergunta (formato YYYY), ou null se não houver"),
    keywords: z.array(z.string()).describe("Palavras-chave importantes da pergunta (nomes, locais, termos técnicos específicos)"),
    intent: z.string().describe("Intenção principal da pergunta em uma frase curta"),
    needsMultipleCategories: z.boolean().describe("True se a pergunta envolve múltiplas categorias (ex: 'quanto custou a decoração' = decoracao + financeiro)")
});

type FilterExtraction = z.infer<typeof FilterExtractionSchema>;

function limitChatHistory(
    chatHistory: Array<HumanMessage | AIMessage>,
    config = MEMORY_CONFIG
): Array<HumanMessage | AIMessage> {
    if (chatHistory.length === 0) return [];

    // Pegar últimas MAX_MESSAGES mensagens
    let candidates = chatHistory.slice(-config.MAX_MESSAGES);

    // Calcular total de caracteres
    let totalChars = candidates.reduce((sum, msg) => {
        const content = typeof msg.content === 'string' ? msg.content : String(msg.content);
        return sum + content.length;
    }, 0);

    // Remover mensagens antigas até ficar dentro do limite
    while (totalChars > config.MAX_CHARS && candidates.length > config.MIN_MESSAGES) {
        candidates.shift();
        totalChars = candidates.reduce((sum, msg) => {
            const content = typeof msg.content === 'string' ? msg.content : String(msg.content);
            return sum + content.length;
        }, 0);
    }

    const estimatedTokens = Math.round(totalChars / 4);
    console.log(`📊 Memória: ${candidates.length}/${chatHistory.length} msgs | ${totalChars} chars (~${estimatedTokens} tokens)`);

    return candidates;
}

// function to extract filters with AI
async function extractFiltersWithAI(
    userQuery: string,
    chatHistory: Array<HumanMessage | AIMessage>): Promise<FilterExtraction> {
        console.log(`🤖 Extracting filters with AI...`);

        const extractorModel = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0.0,
            apiKey: OPENAI_API_KEY!,
        })
        const systemPrompt = `Você é um assistente especializado em analisar perguntas sobre a Oktoberlim (festa universitária da USP São Carlos).

    Sua tarefa é extrair informações estruturadas da pergunta do usuário para filtrar documentos relevantes.
    
    CATEGORIAS DISPONÍVEIS:
    - geral: Informações gerais, sobre a festa, história, conceito
    - ativacao: Ativações de marca, experiências interativas, jogos, engajamento
    - atracoes: Shows, artistas, lineup, apresentações, palco
    - bar: Bebidas, cardápio, drinks, consumação, cerveja
    - decoracao: Cenografia, tema, ambientação, visual, ornamentação
    - estruturas: Montagem, equipamentos, som, iluminação, infraestrutura técnica
    - financeiro: Custos, orçamento, preços, investimentos, receitas, despesas
    - liberacao: Alvarás, autorizações, licenças, documentação legal
    - marketing: Divulgação, campanhas, redes sociais, publicidade
    - patrocinio: Patrocinadores, parcerias, apoios, sponsors
    
    INSTRUÇÕES:
    1. Identifique TODAS as categorias relevantes (pode ser mais de uma!)
    2. Se a pergunta envolve aspectos de múltiplas categorias, marque todas
    3. Extraia ano se mencionado (2019, 2020, 2021, 2022, 2023, 2024...)
    4. Identifique palavras-chave importantes (nomes específicos, locais, termos técnicos)
    5. Resuma a intenção da pergunta
    
    EXEMPLOS:
    
    Pergunta: "Quanto custou a decoração da festa?"
    → categories: ["decoracao", "financeiro"]
    → needsMultipleCategories: true
    → intent: "Saber o custo da decoração"
    
    Pergunta: "Quem foram os artistas de 2023?"
    → categories: ["atracoes"]
    → year: "2023"
    → intent: "Listar artistas de 2023"

    Pergunta: "Preciso dos documentos do alvará"
    → categories: ["liberacao"]
    → intent: "Obter documentação de alvará"

    Pergunta: "Como foi a campanha de marketing?"
    → categories: ["marketing"]
    → intent: "Entender estratégia de marketing"

    Pergunta: "Qual foi o gasto total com estrutura e som?"
    → categories: ["estruturas", "financeiro"]
    → needsMultipleCategories: true
    → intent: "Saber custo de estrutura e som"`;

    // create the messages
    const messages: Array<SystemMessage | HumanMessage | AIMessage> = [
        new SystemMessage(systemPrompt)
    ];
    
    // add history context for extraction
    if (chatHistory.length > 0) {
        const limitedHistory = limitChatHistory(chatHistory, {
            MAX_MESSAGES: 4,
            MAX_CHARS: 800,
            MIN_MESSAGES: 0,
        });
        messages.push(...limitedHistory);
    }

    messages.push(new HumanMessage(userQuery));

    const response = await extractorModel.invoke(messages, {
        tools: [{
            type: "function",
            function: {
                name: "extract_filters",
                description: "Extrai filtros estruturados da pergunta do usuário",
                parameters: zodToJsonSchema(FilterExtractionSchema)
            }
        }],
        tool_choice: { type: "function", function: { name: "extract_filters" } }
    });

    // parse the response
    const toolCalls = response.additional_kwargs.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
        console.log(`⚠️  LLM não retornou tool call, usando fallback`);
        return {
            categories: [],
            year: null,
            keywords: userQuery.split(" ").filter(w => w.length > 3).slice(0, 5),
            intent: userQuery,
            needsMultipleCategories: false
        };
    }

    const toolCall = toolCalls[0];
    const extracted: FilterExtraction = JSON.parse(toolCall.function.arguments);
    
    console.log(`✅ Filtros extraídos:`);
    console.log(`   📂 Categorias: [${extracted.categories.join(", ") || "nenhuma"}]`);
    console.log(`   📅 Ano: ${extracted.year || "nenhum"}`);
    console.log(`   🔑 Keywords: [${extracted.keywords.join(", ")}]`);
    console.log(`   🎯 Intenção: "${extracted.intent}"`);
    console.log(`   🔀 Multi-categoria: ${extracted.needsMultipleCategories}`);
    
    return extracted;
}

// function to build the metadata filter
function buildMetadataFilter(extraction: FilterExtraction): Record<string, any> | undefined {
    const filter: Record<string, any> = {};
    
    // if there are categories, use $in operator to search for multiple
    if (extraction.categories.length > 0) {
        if (extraction.categories.length === 1) {
            filter.category = extraction.categories[0];
        } else {
            filter.category = { $in: extraction.categories };
        }
    }
    
    // add year filter if present
    if (extraction.year) {
        filter.year = extraction.year;
    }
    
    return Object.keys(filter).length > 0 ? filter : undefined;
}

// function to get the description of the filter
function getFilterDescription(filter: Record<string, any> | undefined): string {
    if (!filter) return "[No filters provided - all categories]";

    const parts: string[] = [];

    if (filter.category){
        if (typeof filter.category === 'string'){
            parts.push(`categorias: "${filter.category}"`);
        } else if (filter.category.$in){
            parts.push(`categorias: [${filter.category.$in.join(", ")}]`);
        }
    }

    if (filter.year){
        parts.push(`ano=${filter.year}`);
    }
    return `[${parts.join(" + ")}]`;
}


export async function POST(req: Request){
    try {
        // obtain the prompt from the request
        const {messages} = await req.json();
        const userQuery = messages[messages.length - 1].content;

        console.log(`\n${"=".repeat(70)}`);
        console.log(`🔍 Nova query: "${userQuery}"`);
        console.log(`${"=".repeat(70)}`);

        //create chatmodel
        const chatModel = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0.5,
            apiKey: OPENAI_API_KEY!,
            streaming: true,
        })

        //create embeddings model
        const embeddings = new OpenAIEmbeddings({
            apiKey: OPENAI_API_KEY!,
            model: "text-embedding-3-small",
            dimensions: 1024,
        })

        //create vector store
        const vectorStore = new AstraDBVectorStore(embeddings, {
            token: ASTRA_DB_TOKEN!,
            endpoint: ASTRA_DB_API_ENDPOINT!,
            keyspace: ASTRA_DB_NAMESPACE!,
            collection: ASTRA_DB_COLLECTION!,
            skipCollectionProvisioning: true,
            contentKey: "content",
        })
        await vectorStore.initialize();
        console.log(`📊 Vector store initialized`);

        const fullChatHistory = messages.slice(0, -1).map((msg: any) => {
            return msg.role === "user" 
                ? new HumanMessage(msg.content) 
                : new AIMessage(msg.content)
        })

        console.log(`💬 Histórico total: ${fullChatHistory.length} mensagens`);

        const extraction = await extractFiltersWithAI(userQuery, fullChatHistory);
        const metadataFilter = buildMetadataFilter(extraction);

        const baseRetriever = vectorStore.asRetriever({
            k: 5,
            filter: metadataFilter,
            searchType: "similarity",
        })

        // Re-ranking com Cohere desabilitado temporariamente
        // devido a incompatibilidade com createHistoryAwareRetriever
        const retriever = baseRetriever;
        console.log(`📊 Usando retriever base (sem re-ranking)`);

        // prompt to reformulate the query
        const historyAwarePrompt = ChatPromptTemplate.fromMessages([
            new MessagesPlaceholder("chat_history"),
            ["user", "{input}"],
            [
                "user",
                `Dada a conversa acima, reformule a última pergunta do usuário em uma consulta de busca otimizada.

Contexto da análise:
- Intenção detectada: ${extraction.intent}
- Categorias relevantes: ${extraction.categories.join(", ") || "nenhuma"}
- Keywords importantes: ${extraction.keywords.join(", ")}

Crie uma query de busca que:
1. Mantenha termos específicos (nomes, datas, locais)
2. Expanda sinônimos relevantes
3. Seja clara e focada no que o usuário quer saber

A query reformulada deve ser ideal para busca semântica.`
            ],
        ])

        const limitedChatHistory = limitChatHistory(fullChatHistory, MEMORY_CONFIG);

        const historyAwareRetriever = await createHistoryAwareRetriever({
            llm: chatModel as any,
            retriever: retriever as any,
            rephrasePrompt: historyAwarePrompt as any,
        })

        // prompt to answer the question
        const systemPrompt = `Você é um assistente especializado sobre a Oktoberlim, festa universitária da USP São Carlos feita pela República Berlim.

📊 ANÁLISE DA PERGUNTA:
- Intenção: ${extraction.intent}
- Categorias: ${extraction.categories.join(", ") || "busca geral"}
- Ano: ${extraction.year || "não especificado"}
- Multi-categoria: ${extraction.needsMultipleCategories ? "sim" : "não"}

📚 CONTEXTO RECUPERADO:
{context}

🎯 INSTRUÇÕES:
1. Use as informações do contexto como prioridade
2. Responda focando na intenção identificada: "${extraction.intent}"
3. Se a pergunta envolve múltiplas categorias, integre as informações de forma coerente
4. Cite fontes quando relevante (ex: "conforme página 5 do documento X")
5. Se não houver informações suficientes no contexto, seja honesto e mencione

⚠️ IMPORTANTE:
- Responda APENAS sobre a ÚLTIMA pergunta do usuário
- Use o histórico apenas para entender o contexto conversacional
- Seja específico, objetivo e baseado em dados quando possível`
        
        const answerPrompt = ChatPromptTemplate.fromMessages([
            ["system", systemPrompt],
            new MessagesPlaceholder("chat_history"),
            ["user", "{input}"],
        ])

        const documentChain = await createStuffDocumentsChain({
            llm: chatModel as any,
            prompt: answerPrompt as any,
        })

        const retrievalChain = await createRetrievalChain({
            retriever: historyAwareRetriever as any,
            combineDocsChain: documentChain as any,
        })

        console.log(`⚡ Executing retrieval chain...\n`);
        const stream = await retrievalChain.invoke({
            input: userQuery,
            chat_history: limitedChatHistory as any,
        })

        console.log(`\n🎯 Resultado completo:`, JSON.stringify(stream, null, 2));
        console.log(`🎯 Tem answer?`, 'answer' in stream);
        console.log(`🎯 Tem context?`, 'context' in stream);

        // Retornar resposta simples para teste
        const encoder = new TextEncoder();
        const response = typeof stream.answer === 'string' ? stream.answer : "Nenhuma resposta foi gerada.";
        console.log(`📤 Enviando resposta: "${response}"`);

        return new Response(encoder.encode(response), {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
      /*  
        const encoder = new TextEncoder()

        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    let documentsRetrieved = 0;
                    let fullResponse = ""; // Acumular resposta completa para debug
                    
                    for await (const chunk of stream) {
                        // Log of retrieved documents
                        if (chunk && chunk.context && documentsRetrieved === 0) {
                            documentsRetrieved = chunk.context.length;
                            console.log(`📄 Documents retrieved: ${documentsRetrieved}`);
                            
                            chunk.context.forEach((doc: any, idx: number) => {
                                const category = doc.metadata?.category || 'N/A';
                                const filename = doc.metadata?.filename || 'Unknown';
                                const page = doc.metadata?.pageNumber || 'N/A';
                                console.log(`   ${idx + 1}. [${category}] ${filename} - Pág. ${page}`);
                            });
                            console.log(``);
                        }
                        
                        if (chunk) {
                            console.log(`🔍 Chunk keys:`, Object.keys(chunk));
                            console.log(`🔍 Chunk:`, chunk);
                        }

                        // Streaming the response
                        if (chunk && chunk.answer) {
                            const content = typeof chunk.answer === 'string' 
                                ? chunk.answer 
                                : String(chunk.answer)
                            
                            if (content) {
                                console.log(`💬 Chunk recebido: "${content}"`) // chunk log
                                fullResponse += content;
                                
                                const words = content.split(/(\s+)/)
                                
                                for (const word of words) {
                                    if (word) {
                                        const event = `0:${JSON.stringify(word)}\n`
                                        controller.enqueue(encoder.encode(event))
                                        await new Promise(resolve => setTimeout(resolve, 10))
                                    }
                                }
                            }
                        }
                    }
                    
                    console.log(`\n📝 full response: "${fullResponse}"`);
                    console.log(`📊 total characters: ${fullResponse.length}`);
                    console.log(`✅ Response sent successfully`);
                    console.log(`${"=".repeat(70)}\n`);
                    controller.close()
                } catch (error) {
                    console.error("❌ Error in stream:", error)
                    controller.error(error)
                }
            },
        })

        return new Response(readableStream, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        })
            */

    } catch (error) {
        console.error("❌ Error in API:", error)
        return new Response(JSON.stringify({ 
            error: "Error processing request",
            details: error instanceof Error ? error.message : String(error)
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        })
    }
}
