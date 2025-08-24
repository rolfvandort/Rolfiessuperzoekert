// Aanhalingstekens gecorrigeerd en structuur verduidelijkt
const axios = require("axios");
const xml2js = require("xml2js");

async function performSearch(query) {
    if (!query) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Zoekterm is leeg.' })
        };
    }

    const apiUrl = `http://data.rechtspraak.nl/uitspraken/zoeken?q=${encodeURIComponent(query)}&max=20`;
    const apiResponse = await axios.get(apiUrl);

    const parsedData = await new Promise((resolve, reject) => {
        xml2js.parseString(apiResponse.data, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    const entries = parsedData?.feed?.entry;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return {
            statusCode: 200,
            body: JSON.stringify([])
        };
    }

    const cleanResults = entries.map(entry => {
        const id = entry?.id?.[0] ?? 'ID Onbekend';
        const title = entry?.title?.[0] ?? 'Titel Onbekend';
        const updated = entry?.updated?.[0] ?? new Date().toISOString();
        const link = entry?.link?.[0]?.$?.href ?? '#';
        
        let summary = 'Geen samenvatting beschikbaar.';
        if (entry?.summary?.[0]) {
            const summaryNode = entry.summary[0];
            summary = (typeof summaryNode === 'object' && summaryNode._) ? summaryNode._ : summaryNode;
        }

        return { id, title, summary, updated, link };
    });

    return {
        statusCode: 200,
        body: JSON.stringify(cleanResults)
    };
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Alleen POST requests zijn toegestaan.' })
        };
    }

    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Zoekterm ontbreekt in het verzoek.' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        return await performSearch(body.query);
    } catch (error) {
        console.error('Fout in serverless functie:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Er is een interne fout opgetreden.', error: error.message })
        };
    }
};
