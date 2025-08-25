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

        // Validatie: er moet ofwel een query of een filter zijn.
        if (!query && !dateStart && !dateEnd && instances.length === 0 && lawAreas.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Geen zoekterm of filter opgegeven.' }) };
        }

        const params = new URLSearchParams();
        
        // De 'q' parameter wordt alleen meegestuurd als het een pure trefwoord-zoekopdracht is.
        if (query && !dateStart && !dateEnd && instances.length === 0 && lawAreas.length === 0) {
             params.append('q', query);
        }

        params.append('return', 'DOC');
        params.append('max', resultsPerPage);
        
        // CORRECTIE 1: Sorteren volgens documentatie
        params.append('sort', 'DESC');

        // CORRECTIE 2: Paginering volgens documentatie
        const fromValue = (page - 1) * resultsPerPage;
        if (fromValue > 0) {
            params.append('from', fromValue);
        }

        // CORRECTIE 3: Datums volgens documentatie
        if (dateStart) params.append('date', dateStart);
        if (dateEnd) params.append('date', dateEnd);
        
        // CORRECTIE 4: Instanties & Rechtsgebieden volgens documentatie
        instances.forEach(instance => params.append('creator', instance));
        lawAreas.forEach(area => params.append('subject', area));

        const apiUrl = `https://data.rechtspraak.nl/uitspraken/zoeken?${params.toString()}`;
        
        console.log("DEFINITIEVE API URL:", apiUrl);

        const apiResponse = await axios.get(apiUrl, {
            headers: { 'Accept': 'application/atom+xml' }
        });
        
        const parsedData = await parseXml(apiResponse.data);
        const entries = parsedData?.feed?.entry;
        
        // *** CRUCIALE FIX: Totaal aantal resultaten correct parsen uit de <subtitle> tag ***
        let totalResults = 0;
        const subtitle = parsedData?.feed?.subtitle;
        if (typeof subtitle === 'string') {
            const match = subtitle.match(/\d+/); // Zoek naar de eerste reeks getallen
            if (match) {
                totalResults = parseInt(match[0], 10);
            }
        }

        if (!entries) {
            return { statusCode: 200, body: JSON.stringify({ results: [], total: totalResults }) };
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
};            query, 
            dateStart, 
            dateEnd, 
            instances = [], 
            lawAreas = [], 
            page = 1 
        } = body;

        const resultsPerPage = 20;

        // --- CORRECTIES TEN OPZICHTE VAN DE API DOCUMENTATIE ---

        const params = new URLSearchParams();
        
        // ALGEMEEN: De documentatie specificeert geen algemene full-text zoekparameter 'q'.
        // Zoeken gebeurt primair via de gestructureerde parameters zoals 'creator', 'subject', en 'date'.
        // De 'q' parameter wordt hier weggelaten, omdat deze niet in de handleiding voor de 'zoeken' endpoint staat.
        // Als je een ECLI of LJN hebt, moet je de 'replaces' of 'id' parameter gebruiken op andere endpoints.

        // CORRECTIE 1: Datums (Parameter: 'date')
        // De documentatie (paragraaf 4.3.3) geeft aan dat je voor een periode twee keer de 'date' parameter moet gebruiken.
        if (dateStart) params.append('date', dateStart);
        if (dateEnd) params.append('date', dateEnd);

        // CORRECTIE 2: Instanties (Parameter: 'creator')
        // De parameter voor instanties is 'creator' (paragraaf 4.3.1).
        instances.forEach(instance => params.append('creator', instance));

        // CORRECTIE 3: Rechtsgebieden (Parameter: 'subject')
        // De parameter voor rechtsgebieden is 'subject' (paragraaf 4.3.4).
        lawAreas.forEach(area => params.append('subject', area));

        // CORRECTIE 4: Paginering (Parameter: 'from')
        // De parameter voor paginering is 'from' en is 0-based (paragraaf 4.3.9).
        // De waarde is het start-item, niet het paginanummer.
        const fromValue = (page - 1) * resultsPerPage;
        if (fromValue > 0) {
            params.append('from', fromValue);
        }

        // CORRECTIE 5: Aantal resultaten (Parameter: 'max')
        // De parameter om het maximum aantal resultaten te bepalen is 'max' (paragraaf 4.3.8).
        params.append('max', resultsPerPage);
        
        // CORRECTIE 6: Sorteren (Parameter: 'sort')
        // De parameter voor sorteren is 'sort' en accepteert 'ASC' of 'DESC' (paragraaf 4.3.10).
        // Standaard is 'ASC' (oudste eerst). We zetten hem op 'DESC' voor nieuwste eerst.
        params.append('sort', 'DESC');

        // De 'return' parameter is optioneel. 'DOC' retourneert alleen ECLI's met documenten.
        // We laten deze hier weg om alle metadata te krijgen, zoals de documentatie suggereert.
        // params.append('return', 'DOC');

        const apiUrl = `http://data.rechtspraak.nl/uitspraken/zoeken?${params.toString()}`;
        
        console.log("Gebruikte API URL:", apiUrl);

        // Make the API request
        const apiResponse = await axios.get(apiUrl, {
            headers: { 'Accept': 'application/atom+xml' } // The API returns Atom XML
        });
        
        // Parse the XML response
        const parsedData = await parseXml(apiResponse.data);
        const entries = parsedData?.feed?.entry;
        
        // Extract total results count from the <subtitle> tag
        let totalResults = 0;
        const subtitle = parsedData?.feed?.subtitle;
        if (typeof subtitle === 'string' && subtitle.includes(':')) {
            const numberPart = subtitle.split(':')[1].trim();
            totalResults = parseInt(numberPart, 10) || 0;
        }

        // Return empty results if no entries are found
        if (!entries || entries.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ results: [], total: 0 }) };
        }

        // Ensure entries is always an array
        const entriesArray = Array.isArray(entries) ? entries : [entries];

        // Map the parsed entries to a cleaner format
        const cleanResults = entriesArray.map(entry => {
            let summary = 'Geen samenvatting beschikbaar.';
            if (entry?.summary) {
                // The summary can be a string or an object with a '_' property
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

        // Return the successful response
        return {
            statusCode: 200,
            body: JSON.stringify({ results: cleanResults, total: totalResults })
        };

    } catch (error) {
        // Log and return any errors
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error('Fout in serverless functie:', errorMessage);
        return {
            statusCode: error.response?.status || 500,
            body: JSON.stringify({ message: 'Er is een interne fout opgetreden.', error: errorMessage })
        };
    }
};
