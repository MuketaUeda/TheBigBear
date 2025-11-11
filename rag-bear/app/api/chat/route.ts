import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai"
import { AstraDBVectorStore } from "@langchain/community/vectorstores/astradb"
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
import { createRetrievalChain } from "langchain/chains/retrieval"
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever"
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { HumanMessage, AIMessage, SystemMessage} from "@langchain/core/messages"
import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression"
import { CohereRerank } from "@langchain/cohere"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

const {
    ASTRA_DB_TOKEN,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION,
    OPENAI_API_KEY,
    COHERE_API_KEY,
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

//AQUI
function getFilterDescription()


export async function POST(req: Request){
    try {
        // obtain the prompt from the request
        const {messages} = await req.json();
        const userQuery = messages[messages.length - 1].content;

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
        })

        //create vector store
        const vectorStore = new AstraDBVectorStore(embeddings, {
            token: ASTRA_DB_TOKEN!,
            endpoint: ASTRA_DB_API_ENDPOINT!,
            keyspace: ASTRA_DB_NAMESPACE!,
            collection: ASTRA_DB_COLLECTION!,
        })

        const baseRetriever = vectorStore.asRetriever({
            k: 3,
        })

        // O contexto é ESPECÍFICO para esta query, não acumula!
        const systemPrompt = `Você é um assistente de IA que responde perguntas sobre a Oktoberlim e ajuda a encontrar insights estratégicos sobre a festa, a festa é universitária e da USP de São Carlos feita pela República Berlim. Use as informações do contexto oferecido para responder a pergunta do usuário. Se não houver informações relevantes no contexto, responda usando suas próprias informações e conhecimentos e fale que foi respondido com base em suas próprias informações e conhecimentos.

IMPORTANTE: Você receberá um histórico de conversa. Responda APENAS sobre a ÚLTIMA pergunta do usuário. As mensagens anteriores são apenas para você entender o contexto da conversa. Se a última pergunta referenciar conversas anteriores, você pode usar esse contexto, mas sempre foque em responder apenas a última pergunta.

        Contexto: ${context}`

        // create the langchain messages
        const langchainMessages: any[] = []
        langchainMessages.push(["system", systemPrompt])

        // Manter histórico de conversa para contexto conversacional
        // Mas usar apenas a última pergunta para buscar contexto no banco
        for (let i = 0; i < messages.length - 1; i++){
            const msg = messages[i];
            if (msg.role === "user"){
                langchainMessages.push(["human", msg.content])
            } else {
                langchainMessages.push(["ai", msg.content])
            }
        }

        langchainMessages.push(["human", userQuery])

        // create the stream response
        const stream = await chatModel.stream(langchainMessages)
        const encoder = new TextEncoder()
        
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    let totalChars = 0
                    
                    for await (const chunk of stream) {
                        const content = typeof chunk.content === 'string' ? chunk.content : String(chunk.content)
                        if (content) {
                            // Enviar cada character/palavra como um evento separado para real streaming
                            // Isso faz o frontend atualizar a UI em tempo real
                            const words = content.split(/(\s+)/) // Split mantendo os espaços
                            
                            for (const word of words) {
                                if (word) {
                                    totalChars += word.length
                                    const event = `0:${JSON.stringify(word)}\n`
                                    controller.enqueue(encoder.encode(event))
                                    
                                    // Pequeno delay para simular streaming mais suave
                                    await new Promise(resolve => setTimeout(resolve, 10))
                                }
                            }
                        }
                    }
                    
                    controller.close()
                } catch (error) {
                    console.error("❌ Erro no stream:", error)
                    controller.error(error)
                }
            },
        })

        // return the response
        return new Response(readableStream, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        })

    } catch (error) {
        console.error("Erro na API:", error)
        return new Response(JSON.stringify({ error: "Erro ao processar requisição" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        })
    }
}
