const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const { id } = event.queryStringParameters;

    if (!id) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Parameter "id" (ECLI) is verplicht.' }),
        };
    }

    const API_URL = `https://data.rechtspraak.nl/uitspraken/content?id=${encodeURIComponent(id)}`;
    console.log(`Backend roept content API aan: ${API_URL}`);

    try {
        const apiResponse = await fetch(API_URL);

        if (!apiResponse.ok) {
            throw new Error(`Rechtspraak.nl content API reageerde met status: ${apiResponse.status}`);
        }

        const xmlText = await apiResponse.text();

        // Stuur de rauwe XML direct terug naar de frontend
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml',
            },
            body: xmlText,
        };
    } catch (error) {
        console.error("Fout in serverless-functie (search-content):", error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: `Kon inhoud niet ophalen. Details: ${error.message}`,
            }),
        };
    }
};
