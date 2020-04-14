// example implementation taken from official azure github account and modified
// https://github.com/Azure/azure-cosmosdb-js-server/blob/master/samples/stored-procedures/update.js
function upsertSproc(doc, originalSn) {
    if (!doc) throw new Error("The document is undefined or null.");

    var collection = getContext().getCollection();
    var collectionLink = collection.getSelfLink();
    var stream_id = doc.stream_id;

    retrieveDoc(doc, callback);

    function retrieveDoc(doc, callback) {
        var filterQuery =
        {
            'query' : 'SELECT * FROM c WHERE c.stream_id = @stream_id',
            'parameters' : [{ 'name': '@stream_id', 'value': stream_id }]
        };
        var isAccepted = collection.queryDocuments(
            collectionLink,
            filterQuery,
            function(err, retrievedDocs) {
                if (err) throw err;
                if (retrievedDocs.length > 1) {
                    throw new Error(`Failed to get single document, found multiple: stream_id: ${stream_id}`)
                } else if ( retrievedDocs.length === 1) {
                    tryReplace(retrievedDocs[0], doc, callback);
                } else {
                    tryCreate(doc, callback);
                }
            });
        if (!isAccepted) throw new Error(`DB Query returned FALSE: Failed to query documents: stream_id: ${stream_id}, sn: ${doc.sn}`);
    }

    function tryCreate(doc, callback) {
        var isAccepted = collection.createDocument(collectionLink, doc, callback);
        if (!isAccepted) throw new Error(`DB Query returned FALSE: Failed to create document: stream_id: ${stream_id}, sn: ${doc.sn}`);
    }

    function tryReplace(docToReplace, docContent, callback) {
        if (docToReplace.sn != originalSn || docContent.sn <= docToReplace.sn) {
            throw new Error(`Sequence Conflict for document: stream_id: ${doc.stream_id}, new sn: ${doc.sn}, expected sn: ${originalSn}, actual sn: ${docToReplace.sn}.`);
        }
        var isAccepted = collection.replaceDocument(docToReplace._self, docContent, callback);
        if (!isAccepted) throw new Error(`DB Query returned FALSE: Failed to replace document: stream_id: ${stream_id}, sn: ${doc.sn}`);
    }

    function callback(err) {
        if (err) throw err;
    }
};
