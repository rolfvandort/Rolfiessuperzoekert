const axios = require("axios");
const xml2js = require("xml2js");

const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
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

        const resultsPerPage = 20;

        if (!query) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Zoekterm is leeg.' }) };
        }

        // Bouw de API URL met de CORRECTE parameters uit de documentatie
        const params = new URLSearchParams();
        
        // De 'q' parameter voor de zoekterm is niet officieel gedocumenteerd, maar wel de standaard.
        // We behouden deze, maar voegen de andere correcte parameters toe.
        if (query) {
             params.append('q', query);
        }

        params.append('return', 'DOC');
        params.append('max', resultsPerPage);
        
        // *** CORRECTIE 1: Sorteren ***
        // De parameter accepteert alleen DESC of ASC.
        params.append('sort', 'DESC');

        // *** CORRECTIE 2: Paginering ***
        // De parameter is 'from', niet 'page'. De waarde is het start-item.
        const fromValue = (page - 1) * resultsPerPage;
        if (fromValue > 0) {
            params.append('from', fromValue);
        }

        // *** CORRECTIE 3: Datums ***
        // De parameter is twee keer 'date', niet 'date-start' en 'date-end'.
        if (dateStart) params.append('date', dateStart);
        if (dateEnd) params.append('date', dateEnd);
        
        // *** CORRECTIE 4: Instanties & Rechtsgebieden ***
        // De parameters zijn 'creator' en 'subject'.
        instances.forEach(instance => params.append('creator', instance));
        lawAreas.forEach(area => params.append('subject', area));

        const apiUrl = `https://data.rechtspraak.nl/uitspraken/zoeken?${params.toString()}`;
        
        console.log("DEFINITIEVE API URL:", apiUrl);

        const apiResponse = await axios.get(apiUrl, {
            headers: { 'Accept': 'application/atom+xml' }
        });
        
        const parsedData = await parseXml(apiResponse.data);
        const entries = parsedData?.feed?.entry;
        
        const totalResults = parseInt(parsedData?.feed?.totalResults?._ || '0', 10);

        if (!entries || entries.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ results: [], total: 0 }) };
        }

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
