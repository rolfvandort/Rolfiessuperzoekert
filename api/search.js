const axios = require('axios');
const xml2js = require('xml2js');

const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

exports.handler = async (event, context) => {
    // VEILIGHEIDSCONTROLE 1: Zorg ervoor dat de motor niet crasht bij een test-ping (GET request)
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // Method Not Allowed
            body: JSON.stringify({ message: 'Alleen POST requests zijn toegestaan.' })
        };
    }
    
    // VEILIGHEIDSCONTROLE 2: Controleer of er wel een 'brief' (body) is voordat we hem proberen te lezen
    if (!event.body) {
        return {
            statusCode: 400, // Bad Request
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

        const apiUrl = `http://data.rechtspraak.nl/uitspraken/zoeken?q=${encodeURIComponent(query)}&max=20`;
        const apiResponse = await axios.get(apiUrl);
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
        console.error('Fout in serverless functie:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Er is een interne fout opgetreden bij het verwerken van de zoekopdracht.', error: error.message })
        };
    }
};
