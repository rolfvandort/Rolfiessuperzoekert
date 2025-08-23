const axios = require('axios');
const xml2js = require('xml2js');

// Helper functie om de XML te parsen
const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
};

// De hoofd-handler, nu met de correcte 'module.exports' syntax
module.exports = async (request, response) => {
    // Sta alleen POST requests toe
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Alleen POST requests zijn toegestaan.' });
    }

    try {
        const { query } = request.body;
        if (!query) {
            return response.status(400).json({ message: 'Zoekterm ontbreekt.' });
        }

        // Bouw de URL voor de Rechtspraak.nl API
        const apiUrl = `http://data.rechtspraak.nl/uitspraken/zoeken?q=${encodeURIComponent(query)}&max=20`;

        // Haal de data op van de API
        const apiResponse = await axios.get(apiUrl);
        const xmlData = apiResponse.data;

        // Parse de XML data naar een JavaScript object
        const parsedData = await parseXml(xmlData);
        
        const entries = parsedData.feed.entry;

        // Controleer of er resultaten zijn
        if (!entries || entries.length === 0) {
            return response.status(200).json([]);
        }

        // Vertaal de resultaten naar een schone JSON structuur
        const cleanResults = entries.map(entry => {
            // Soms is de summary een object, soms een string. Dit vangt beide gevallen op.
            let summaryText = 'Geen samenvatting beschikbaar.';
            if (entry.summary && entry.summary[0]) {
                if (typeof entry.summary[0] === 'object' && entry.summary[0]._) {
                    summaryText = entry.summary[0]._;
                } else if (typeof entry.summary[0] === 'string') {
                    summaryText = entry.summary[0];
                }
            }

            return {
                id: entry.id[0],
                title: entry.title[0],
                summary: summaryText,
                updated: entry.updated[0],
                link: entry.link[0].$.href
            };
        });

        // Stuur de schone resultaten terug
        response.status(200).json(cleanResults);

    } catch (error) {
        console.error('Fout in serverless functie:', error);
        response.status(500).json({ message: 'Er is een interne fout opgetreden.', error: error.message });
    }
};
