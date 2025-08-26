const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');

exports.handler = async (event, context) => {
    const API_BASE_URL = 'https://data.rechtspraak.nl/uitspraken/zoeken';
    
    // --- START VAN DE AANPASSING ---
    // Filter de parameters om alleen die met een waarde over te houden
    const originalParams = event.queryStringParameters;
    const filteredParams = new URLSearchParams();
    for (const key in originalParams) {
        if (originalParams[key]) { // Alleen toevoegen als de parameter een waarde heeft
            filteredParams.append(key, originalParams[key]);
        }
    }
    // --- EINDE VAN DE AANPASSING ---

    const apiUrl = `${API_BASE_URL}?${filteredParams.toString()}`;

    try {
        const apiResponse = await fetch(apiUrl);

        if (!apiResponse.ok) {
            // Geef de status van de externe API direct door in de foutmelding
            throw new Error(`Rechtspraak.nl API reageerde met status: ${apiResponse.status}`);
        }

        const xmlText = await apiResponse.text();

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "_",
            textNodeName: "#text"
        });
        const parsedXml = parser.parse(xmlText);
        
        const feed = parsedXml.feed;
        let entries = feed.entry;

        if (entries && !Array.isArray(entries)) {
            entries = [entries];
        }

        const results = (entries || []).map(entry => ({
            id: entry.id,
            title: entry.title,
            summary: entry.summary["#text"],
            updated: entry.updated,
            link: entry.link._href,
        }));

        const subtitle = feed.subtitle || "Aantal gevonden ECLI's: 0";
        const totalMatch = subtitle.match(/\d+/);
        const totalResults = totalMatch ? parseInt(totalMatch[0], 10) : 0;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                total: totalResults,
                results: results,
            }),
        };

    } catch (error) {
        console.error("Fout in serverless-functie:", error);
        
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: `Er is een fout opgetreden bij het communiceren met de Rechtspraak.nl API. Details: ${error.message}`,
            }),
        };
    }
};
