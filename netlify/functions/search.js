const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');

exports.handler = async (event, context) => {
    const API_BASE_URL = 'https://data.rechtspraak.nl/uitspraken/zoeken';
    
    const originalParams = event.queryStringParameters;
    const filteredParams = new URLSearchParams();

    // Verwerk de parameters. Dit ondersteunt nu meerdere waarden voor dezelfde sleutel.
    for (const key in originalParams) {
        if (originalParams[key]) {
            // Split waarden op komma, voor het geval de frontend meerdere selecties zo doorgeeft
            originalParams[key].split(',').forEach(value => {
                if (value) { // Zorg ervoor dat lege strings niet worden toegevoegd
                    // De incorrecte hernoeming is verwijderd. De 'key' wordt direct gebruikt.
                    filteredParams.append(key, value);
                }
            });
        }
    }

    const apiUrl = `${API_BASE_URL}?${filteredParams.toString()}`;
    console.log(`Backend roept Rechtspraak.nl aan: ${apiUrl}`);

    try {
        const apiResponse = await fetch(apiUrl);

        if (!apiResponse.ok) {
            throw new Error(`Rechtspraak.nl API reageerde met status: ${apiResponse.status}`);
        }

        const xmlText = await apiResponse.text();

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "_",
            textNodeName: "#text",
            parseAttributeValue: true,
            trimValues: true,
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
            summary: entry.summary ? (entry.summary["#text"] || entry.summary) : 'Geen samenvatting beschikbaar.',
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
        console.error("Fout in serverless-functie (search):", error);
        
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
