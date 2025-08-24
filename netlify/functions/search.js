const axios = require("axios");
const xml2js = require("xml2js");

const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
        // Expliciete instellingen om te zorgen dat we alle data correct parsen
        const parser = new xml2js.Parser({
            explicitArray: false,
            tagNameProcessors: [xml2js.processors.stripPrefix],
        });
        parser.parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Alleen POST requests zijn toegestaan.' }) };
    }
    
    if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Request body ontbreekt.' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { 
            query, 
            dateStart, 
            dateEnd, 
            instances = [], 
            lawAreas = [], 
            page = 1 
        } = body;

        if (!query) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Zoekterm is leeg.' }) };
        }

        // Bouw de API URL dynamisch op
        const params = new URLSearchParams();
        params.append('q', query);
        params.append('return', 'DOC');
        params.append('sort', 'publicatiedatum'); // *** DEFINITIEVE CORRECTIE HIER TOEGEPAST ***
        params.append('max', 20);      // Resultaten per pagina (aanpasbaar)
        params.append('page', page);

        if (dateStart) params.append('date-start', dateStart);
        if (dateEnd) params.append('date-end', dateEnd);
        
        // Voeg meerdere waarden voor instanties en rechtsgebieden toe
        instances.forEach(instance => params.append('instantie', instance));
        lawAreas.forEach(area => params.append('rechtsgebied', area));

        const apiUrl = `https://data.rechtspraak.nl/uitspraken/zoeken?${params.toString()}`;
        
        console.log("Requesting API URL:", apiUrl); // Voor debugging in Netlify logs

        const apiResponse = await axios.get(apiUrl, {
            headers: { 'Accept': 'application/atom+xml' }
        });
        
        const parsedData = await parseXml(apiResponse.data);
        const entries = parsedData?.feed?.entry;
        
        // Haal het totale aantal resultaten op voor paginering
        const totalResults = parseInt(parsedData?.feed?.totalResults?._ || '0', 10);

        if (!entries || entries.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ results: [], total: 0 }) };
        }

        // Zorg ervoor dat 'entries' altijd een array is, zelfs bij één resultaat
        const entriesArray = Array.isArray(entries) ? entries : [entries];

        const cleanResults = entriesArray.map(entry => {
            let summary = 'Geen samenvatting beschikbaar.';
            if (entry?.summary) {
                summary = (typeof entry.summary === 'object' && entry.summary._) ? entry.summary._ : entry.summary;
            }

            return {
                id: entry?.id ?? 'ID Onbekend',
                title: entry?.title ?? 'Titel Onbekend',
                summary: summary,
                updated: entry?.updated ?? new Date().toISOString(),
                link: entry?.link?.$?.href ?? '#'
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ results: cleanResults, total: totalResults })
        };

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error('Fout in serverless functie:', errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Er is een interne fout opgetreden.', error: errorMessage })
        };
    }
};
