const axios = require('axios');
const xml2js = require('xml2js');

// Helper functie om de XML te parsen
const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

// De hoofd-handler, nu met de juiste startknop: 'exports.handler'
exports.handler = async (event, context) => {
    // Netlify stuurt data bij een POST-request in event.body
    // Dit moet worden geparsed van een string naar een object
    const body = JSON.parse(event.body);
    const { query } = body;

    try {
        if (!query) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Zoekterm ontbreekt.' })
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

        // Voor Netlify moeten we het antwoord in een specifiek format teruggeven
        return {
            statusCode: 200,
            body: JSON.stringify(cleanResults)
        };

    } catch (error) {
        console.error('Fout in serverless functie:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Er is een interne fout opgetreden.', error: error.message })
        };
    }
};
