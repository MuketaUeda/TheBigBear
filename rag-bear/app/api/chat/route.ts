import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { DataAPIClient } from "@datastax/astra-db-ts"

const {
    ASTRA_DB_TOKEN,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION,
    GOOGLE_API_KEY,
} = process.env;

export async function POST(req: Request){
    try {
        // obtain the prompt from the request
        const {messages} = await req.json();
        const lastMessage = messages[messages.length - 1];
        const userQuery = lastMessage.content;

        // connect to the database
        const client = new DataAPIClient(ASTRA_DB_TOKEN!)
        const db = client.db(ASTRA_DB_API_ENDPOINT!, {
            namespace: ASTRA_DB_NAMESPACE!,
        })
        const collection = db.collection(ASTRA_DB_COLLECTION!)

        // search the database for the most relevant documents
        const searchResults = await collection.find(
            {},
            {
                sort:{$vectorize: userQuery},
                limit: 3,
            }
        )

        // extract the context for the LLM
        let context = ""
        for await (const result of searchResults){
            // O documento armazenou o texto em 'content'?
            let textContent = result.content || result.pageContent || result.text
            
            if (textContent) {
                context += textContent.trim() + "\n\n"
            }
        }
        
        // O contexto é ESPECÍFICO para esta query, não acumula!
        const systemPrompt = `Você é um assistente de IA que responde perguntas sobre a Oktoberlim e ajuda a encontrar insights estratégicos sobre a festa, a festa é universitária e da USP de São Carlos feita pela República Berlim. Use as informações do contexto oferecido para responder a pergunta do usuário. Se não houver informações relevantes no contexto, responda usando suas próprias informações e conhecimentos e fale que foi respondido com base em suas próprias informações e conhecimentos.

IMPORTANTE: Você receberá um histórico de conversa. Responda APENAS sobre a ÚLTIMA pergunta do usuário. As mensagens anteriores são apenas para você entender o contexto da conversa. Se a última pergunta referenciar conversas anteriores, você pode usar esse contexto, mas sempre foque em responder apenas a última pergunta.

        Contexto: ${context}`
        
        // create the chat model
        const chatModel = new ChatGoogleGenerativeAI({
            modelName: "gemini-2.5-flash",
            temperature: 0.5,
            apiKey: GOOGLE_API_KEY!,
        })

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
