function bulkInsertSproc(docs, verifySn) {
    if (!docs) throw new Error("The array is undefined or null.");
    var collection = getContext().getCollection();
    var collectionLink = collection.getSelfLink();
    var docCount = 0;
    var docsLength = docs.length;
    if (docsLength == 0) {
        return;
    }
    var latestSn = 0;
    collection.queryDocuments(
        collection.getSelfLink(),
        "SELECT TOP 1 c.sn FROM c ORDER BY c.sn DESC",
        function (err, feed) {
            if (err) throw err;
            if (feed && feed.length) {
                latestSn = feed[0].sn;
            }
            tryCreate(docs[docCount], callback);
        }
    );

    function tryCreate(doc, callback) {
        if (verifySn) {
            if (doc.sn !== latestSn + 1) {
                throw new Error(`Sequence Conflict for document at index: ${docCount}, stream_id: ${doc.stream_id}, new sn: ${doc.sn}, expected sn: ${doc.sn - 1}, actual sn: ${latestSn}.`);
            }
        } else {
            doc.sn = latestSn + 1;
            doc.id = `${doc.stream_id}-${doc.sn}`;
        }
        latestSn = doc.sn;
        if (!collection.createDocument(collectionLink, doc, callback)) {
            throw new Error(`DB Query returned FALSE: createDocument failed on document at index: ${docCount}, stream_id: ${doc.stream_id}, sn: ${doc.sn}.`);
        }
    }

    function callback(err) {
        if (err) throw err;
        docCount++;
        if (docCount >= docsLength) {
            return;
        } else {
            tryCreate(docs[docCount], callback);
        }
    }
};