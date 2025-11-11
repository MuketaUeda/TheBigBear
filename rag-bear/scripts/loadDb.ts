import * as dotenv from "dotenv";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import path from "path";
import fs from "fs";

dotenv.config();

const {
    ASTRA_DB_TOKEN,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION,
} = process.env;

if (!ASTRA_DB_TOKEN || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_NAMESPACE || !ASTRA_DB_COLLECTION) {
    console.error("❌ Error: Environment variables not configured.");
    process.exit(1);
}

// custom type for the document metadata
interface DocumentMetadata {
  path: string;
  filename: string;
  category: string;
  description: string;
  tags: string[];
}

function getAllPdfFiles(): DocumentMetadata[] {
  const documentsPath = path.join(process.cwd(), "documents");
  const bearData: DocumentMetadata[] = [];

  if (!fs.existsSync(documentsPath)) {
    console.error(`Error: Documents directory not found: ${documentsPath}`);
    return [];
  }
  // Recursively read all pdf files from the documents directory
  function scanDirectory(dirPath: string, category: string = "descategorizado") {
    try{
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        
        // if the file is a directory, use the directory name as the category
        if (file.isDirectory()) {
          console.log(`📁 Scanning category: ${file.name}`);
          scanDirectory(filePath, file.name.toLowerCase());
        } else if (file.name.toLowerCase().endsWith('.pdf')) {
          //if its a pdf file
          bearData.push({
            path: filePath,
            filename: file.name,
            category: category,
            description: file.name.replace('.pdf', ''),
            tags: [category]
          });
        }

      }
    } catch (error) {
      console.error(`❌ Error scanning directory: ${dirPath}:`, error);
    }
  }
  scanDirectory(documentsPath);
  console.log(`\n📊 Summary:`);
  console.log(`   Total PDFs found: ${bearData.length}`);

  const categoryCount: Record<string, number> = {};
  bearData.forEach(doc => {
    categoryCount[doc.category] = (categoryCount[doc.category] || 0) + 1;
  });
  console.log(`   Distribution by category:`);
  Object.entries(categoryCount).forEach(([category, count]) => {
    console.log(`     • ${category}: ${count} document${count > 1 ? 's' : ''}`);
  });
  return bearData;
}


// Load the documents into the database
async function loadDocuments() {
    console.log("🚀 Starting document loading...\n");
    
    const bearData = getAllPdfFiles();

    if (bearData.length === 0) {
      console.error("❌ No PDFs found. Exiting...");
      return;
    }

    // Client for Astra DB
    const client = new DataAPIClient(ASTRA_DB_TOKEN!);
    const db = client.db(ASTRA_DB_API_ENDPOINT!, {
      namespace: ASTRA_DB_NAMESPACE!,
    });
  
    // Split the documents into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 170,
    });

    const collection = db.collection(ASTRA_DB_COLLECTION!);

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    console.log(`${"=".repeat(60)}`);
    console.log(`📚 Loading process started`);
    console.log(`${"=".repeat(60)}\n`);
  
    // Load the documents
    for (const item of bearData) {
      console.log(`\n📄 Document: ${item.filename}`);
      console.log(`   📂 Category: ${item.category}`);
      console.log(`   📍 Path: ${item.path}`);
      
      try {
        const loader = new PDFLoader(item.path);
        const docs = await loader.load();
        
        // Validate if PDF has content
        if (!docs || docs.length === 0) {
          console.log(`   ⚠️  Warning: ${item.filename} has no content. Skipping...`);
          totalSkipped++;
          continue;
        }
        
        const chunks = await splitter.splitDocuments(docs);
        
        // Validate if chunks were generated
        if (chunks.length === 0) {
          console.log(`   ⚠️  Warning: ${item.filename} generated no chunks. Skipping...`);
          totalSkipped++;
          continue;
        }
        
        console.log(`   📦 Divided into ${chunks.length} chunks`);

        // Check if the document already exists
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
          console.log(`   ⏭️  Already in database (${existingChunksCount} chunks). Skipping...`);
          totalSkipped++;
          continue;
        }
        
        // If the document does not exist, insert the chunks
        console.log(`   💾 Inserting ${chunks.length} chunks...`);
    
        // Prepare all documents for batch insertion
        const documentsToInsert = chunks.map((chunk, chunkIndex) => ({
          content: chunk.pageContent,
          $vectorize: chunk.pageContent, 
          ...chunk.metadata, 
          source: item.path,
          type: "pdf",
          filename: item.filename,
          documentTitle: chunk.metadata?.pdf?.info?.Title || item.description,
          category: item.category,
          description: item.description,
          tags: item.tags,
          pageNumber: chunk.metadata?.loc?.pageNumber || null,
          totalPages: chunk.metadata?.pdf?.totalPages || null,
          chunkIndex: chunkIndex,
          createdAt: new Date().toISOString(),
        }));

        // Preview first chunk metadata
        if (documentsToInsert.length > 0) {
          const firstDoc = documentsToInsert[0];
          console.log(`\n   🔍 Preview of metadata (first chunk):`);
          console.log(`      📝 Title: ${firstDoc.documentTitle}`);
          console.log(`      📂 Category: ${firstDoc.category}`);
          console.log(`      📄 Page: ${firstDoc.pageNumber}/${firstDoc.totalPages}`);
          console.log(`      🏷️  Tags: [${firstDoc.tags.join(', ')}]`);
        }

        // Insert in batches of 20 (much faster than one by one)
        const BATCH_SIZE = 20;
        for (let i = 0; i < documentsToInsert.length; i += BATCH_SIZE) {
          const batch = documentsToInsert.slice(i, i + BATCH_SIZE);
          await collection.insertMany(batch);
          
          // Show progress
          const progress = Math.min(i + BATCH_SIZE, documentsToInsert.length);
          console.log(`   ⏳ Progress: ${progress}/${documentsToInsert.length} chunks inserted`);
        }

        console.log(`   ✅ ${item.filename} loaded successfully!`);
        totalProcessed++;
        
      } catch (error: any) {
        // More specific error handling
        console.error(`   ❌ Error loading ${item.filename}:`);
        
        if (error.message?.includes('password')) {
          console.error(`      🔒 PDF is password protected`);
        } else if (error.message?.includes('Invalid PDF')) {
          console.error(`      📄 PDF file is corrupted or invalid`);
        } else if (error.message?.includes('ENOENT')) {
          console.error(`      📁 File not found`);
        } else {
          console.error(`      ⚠️  ${error.message || error}`);
        }
        
        totalErrors++;
      }
    }
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎉 Process completed!`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\n📊 Statistics:`);
    console.log(`   ✅ Successfully processed: ${totalProcessed}`);
    console.log(`   ⏭️  Skipped (already existed or empty): ${totalSkipped}`);
    console.log(`   ❌ Errors: ${totalErrors}`);
    console.log(`   📁 Total documents: ${bearData.length}`);
    
    // Success rate
    const successRate = bearData.length > 0 
      ? ((totalProcessed / bearData.length) * 100).toFixed(1) 
      : 0;
    console.log(`   📈 Success rate: ${successRate}%\n`);
  }

async function main() {
  try {
    await loadDocuments();
  } catch (e) {
    console.error("💥 Fatal error during execution:", e);
    process.exit(1);
  }
}

main();