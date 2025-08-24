const axios = require("axios");
const xml2js = require("xml2js");

const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

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
        const { query } = body;

        if (!query) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Zoekterm is leeg.' })
            };
        }

        const apiUrl = `https://data.rechtspraak.nl/uitspraken/zoeken?return=DOC&q=${encodeURIComponent(query)}&max=50&sort=Relevance`;
        
        // LAATSTE CORRECTIE: Voeg de vereiste 'Accept'-header toe aan het verzoek.
        const apiResponse = await axios.get(apiUrl, {
            headers: {
                'Accept': 'application/atom+xml'
            }
        });
        
        const parsedData = await parseXml(apiResponse.data);
        
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

    } catch (error) {
        // Log de volledige fout voor betere debugging in Netlify
        console.error('Fout in serverless functie:', error.response ? error.response.data : error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Er is een interne fout opgetreden bij het verwerken van de zoekopdracht.', error: error.message })
        };
    }
};
