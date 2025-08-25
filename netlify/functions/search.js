
const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');

// De handler-functie die Netlify zal uitvoeren
exports.handler = async (event, context) => {
    // Bouw de API URL op basis van de parameters van de front-end
    const API_BASE_URL = 'https://data.rechtspraak.nl/uitspraken/zoeken';
    const params = new URLSearchParams(event.queryStringParameters);
    const apiUrl = `${API_BASE_URL}?${params.toString()}`;

    try {
        // Maak de server-naar-server call naar de Rechtspraak.nl API
        const apiResponse = await fetch(apiUrl);

        // Vang fouten van de API af (bv. 404 of 500)
        if (!apiResponse.ok) {
            throw new Error(`Rechtspraak.nl API reageerde met status: ${apiResponse.status}`);
        }

        const xmlText = await apiResponse.text();

        // Configureer de XML-parser
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "_",
            textNodeName: "#text"
        });
        const parsedXml = parser.parse(xmlText);
        
        // Transformeer de complexe XML/JSON-structuur naar een schone, bruikbare structuur
        const feed = parsedXml.feed;
        let entries = feed.entry;

        // Als er maar één resultaat is, is het geen array. Maak er een array van.
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

        // Haal het totaalaantal resultaten uit de <subtitle> tag
        const subtitle = feed.subtitle || "Aantal gevonden ECLI's: 0";
        const totalMatch = subtitle.match(/\d+/);
        const totalResults = totalMatch ? parseInt(totalMatch[0], 10) : 0;

        // Stuur een succesvolle JSON-respons terug naar de front-end
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
        
        // Stuur een duidelijke foutmelding terug naar de front-end
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
