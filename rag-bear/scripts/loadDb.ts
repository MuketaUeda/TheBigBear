import * as dotenv from "dotenv";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import path from "path";

dotenv.config();

const {
    ASTRA_DB_TOKEN,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION,
} = process.env;

if (!ASTRA_DB_TOKEN || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_NAMESPACE || !ASTRA_DB_COLLECTION) {
    console.error("Error: Environment variables not configured.");
    process.exit(1);
}

const bearData = [
  { path: path.join(process.cwd(), "documents", "CV_Gabriel_Rosati_IA.pdf") },
];

// Load the documents into the database
async function loadDocuments() {
    console.log("Starting document loading...");
  
    // Client for Astra DB
    const client = new DataAPIClient(ASTRA_DB_TOKEN!);

    // Get the database object from the client
    const db = client.db(ASTRA_DB_API_ENDPOINT!, {
      namespace: ASTRA_DB_NAMESPACE!,
    });
  
    // Split the documents into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 170,
    });

    const collection = db.collection(ASTRA_DB_COLLECTION!);
  
    // Load the documents
    for (const item of bearData) {
      console.log(`Carregando: ${item.path}`);
      
      try {
        const loader = new PDFLoader(item.path);
        const docs = await loader.load();
        const chunks = await splitter.splitDocuments(docs);
        console.log(`Divided into ${chunks.length} chunks`);
        const existingChunks = await collection.find({
          source: item.path,
          type: "pdf"
        });
        // Count the existing chunks
        let existingChunksCount = 0;
        for await (const chunk of existingChunks) {
          existingChunksCount++;
        }
        // If the document already exists, skip it
        if (existingChunksCount > 0) {
          console.log(`${item.path} is already in the database. Skipping...`);
          continue;
        }
        // If the document does not exist, insert the chunks
        console.log(`${item.path} not duplicated. Inserting ${chunks.length} chunks...`);
    
        // Save directly to Astra DB
        for (const chunk of chunks) {
          const documentToInsert = {
            content: chunk.pageContent,
            $vectorize: chunk.pageContent, 
            ...chunk.metadata, 
            source: item.path,
            type: "pdf"
          };
          // Use the 'collection' object to insert the document
          await collection.insertOne(documentToInsert);
        }
        
        console.log(`✅ ${item.path} loaded successfully!`);
      } catch (error) {
        console.error(`❌ Error loading ${item.path}:`, error);
      }
    }
    console.log("Loading process completed.");
  }

async function main() {
  try {
    await loadDocuments();
  } catch (e) {
    console.error("Fatal error during execution:", e);
    process.exit(1);
  }
}

main();