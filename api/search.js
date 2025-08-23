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

// De hoofd-handler, nu met robuuste data-extractie
module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Alleen POST requests zijn toegestaan.' });
    }

    try {
        const { query } = request.body;
        if (!query) {
            return response.status(400).json({ message: 'Zoekterm ontbreekt.' });
        }

        const apiUrl = `http://data.rechtspraak.nl/uitspraken/zoeken?q=${encodeURIComponent(query)}&max=20`;
        const apiResponse = await axios.get(apiUrl);
        const parsedData = await parseXml(apiResponse.data);
        
        // Veilige controle of er überhaupt entries zijn
        const entries = parsedData?.feed?.entry;

        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return response.status(200).json([]);
        }

        // Vertaal de resultaten naar een schone JSON structuur (nu 'hufterproof')
        const cleanResults = entries.map(entry => {
            // Veilige manier om data te krijgen, met fallbacks
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

        response.status(200).json(cleanResults);

    } catch (error) {
        console.error('Fout in serverless functie:', error);
        response.status(500).json({ message: 'Er is een interne fout opgetreden.', error: error.message });
    }
};
