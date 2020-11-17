// code example adapted from https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs

const { BlobServiceClient } = require('@azure/storage-blob');

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = "containerone";

async function main() {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);

    // Create container
    console.log('\nCreating container...');
    console.log('\t', containerName);

    // Get a reference to a container
    const containerClient = blobServiceClient.getContainerClient(containerName);
    console.log('\ncontainerClient');

    // Create the container
    const createContainerResponse = await containerClient.create();
    console.log("Container was created successfully. requestId: ", createContainerResponse.requestId);

    console.log('\nUpload Blob to Container');
    // Create a unique name for the blob
    const blobName = 'quickstart_one' + '.txt';

    // Get a block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    console.log('\nUploading to Azure storage as blob:\n\t', blobName);

    // Upload data to the blob
    const data = 'Hello, World!';
    const uploadBlobResponse = await blockBlobClient.upload(data, data.length);
    console.log("Blob was uploaded successfully. requestId: ", uploadBlobResponse.requestId);

    console.log('\nListing blobs...');

    // List the blob(s) in the container.
    for await (const blob of containerClient.listBlobsFlat()) {
        console.log('\t', blob.name);
    }

    console.log('\nDownloaded blob content...');
    // Get blob content from position 0 to the end
    // In Node.js, get downloaded data by accessing downloadBlockBlobResponse.readableStreamBody
    const downloadBlockBlobResponse = await blockBlobClient.download(0);
    console.log('\t', await streamToString(downloadBlockBlobResponse.readableStreamBody));

    console.log('\nDeleting container...');

    const deleteContainerResponse = await containerClient.delete();
    console.log("Container was deleted successfully. requestId: ", deleteContainerResponse.requestId);   
}

// A helper function used to read a Node.js readable stream into a string
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      readableStream.on("data", (data) => {
        chunks.push(data.toString());
      });
      readableStream.on("end", () => {
        resolve(chunks.join(""));
      });
      readableStream.on("error", reject);
    });
  }

main().then(() => {console.log("Storage Main Done");}).catch((error) => {
    console.error(error);
});
