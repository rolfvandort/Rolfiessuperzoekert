const axios = require("axios");
const xml2js = require("xml2js");

/**
 * Parses an XML string into a JavaScript object.
 * @param {string} xml - The XML string to parse.
 * @returns {Promise<object>} A promise that resolves with the parsed JavaScript object.
 */
const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
        const parser = new xml2js.Parser({
            explicitArray: false, // Prevents single elements from being wrapped in an array.
            tagNameProcessors: [xml2js.processors.stripPrefix], // Removes namespace prefixes (e.g., 'atom:').
        });
        parser.parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

/**
 * Netlify serverless function to search the Rechtspraak.nl API.
 */
exports.handler = async (event, context) => {
    // Ensure the request is a POST request.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Alleen POST requests zijn toegestaan.' }) };
    }
    
    // Ensure the request has a body.
    if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Request body ontbreekt.' }) };
    }

    try {
        const body = JSON.parse(event.body);
        
        // Destructure the parameters sent from the frontend.
        const { 
            dateStart, 
            dateEnd, 
            instances = [], 
            lawAreas = [], 
            page = 1 
        } = body;

        const resultsPerPage = 20;

        // Use URLSearchParams to safely construct the query string.
        const params = new URLSearchParams();
        
        // --- API PARAMETER MAPPING ---

        // Add date parameters. The API documentation specifies using two 'date' parameters for a range.
        if (dateStart) params.append('date', dateStart);
        if (dateEnd) params.append('date', dateEnd);

        // Add 'creator' parameters for each selected instance.
        instances.forEach(instance => params.append('creator', instance));

        // Add 'subject' parameters for each selected law area.
        lawAreas.forEach(area => params.append('subject', area));
        
        // *** CRUCIALE AANPASSING ***
        // We voegen standaard het documenttype 'Uitspraak' toe.
        // Dit lijkt de API te helpen om de datumfilters correct als een periode te interpreteren,
        // gebaseerd op de voorbeelden in de documentatie.
        params.append('type', 'Uitspraak');

        // Handle pagination. The 'from' parameter is 0-based.
        const fromValue = (page - 1) * resultsPerPage;
        if (fromValue > 0) {
            params.append('from', fromValue);
        }

        // Set the maximum number of results per page.
        params.append('max', resultsPerPage);
        
        // Sort results by modification date, newest first.
        params.append('sort', 'DESC');

        // Construct the final API URL.
        const apiUrl = `http://data.rechtspraak.nl/uitspraken/zoeken?${params.toString()}`;
        
        console.log("Definitieve API URL:", apiUrl);

        // Perform the GET request to the Rechtspraak API.
        const apiResponse = await axios.get(apiUrl, {
            headers: { 'Accept': 'application/atom+xml' } // The API responds with Atom XML.
        });
        
        // Parse the XML response to a JavaScript object.
        const parsedData = await parseXml(apiResponse.data);
        const entries = parsedData?.feed?.entry;
        
        // The total number of results is mentioned in the 'subtitle' tag.
        let totalResults = 0;
        const subtitle = parsedData?.feed?.subtitle;
        if (typeof subtitle === 'string' && subtitle.includes(':')) {
            const numberPart = subtitle.split(':')[1].trim();
            totalResults = parseInt(numberPart, 10) || 0;
        }

        // If there are no results, return an empty array.
        if (!entries || entries.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ results: [], total: 0 }) };
        }

        // Ensure 'entries' is always an array for consistent mapping, even with a single result.
        const entriesArray = Array.isArray(entries) ? entries : [entries];

        // Map the raw API results to a cleaner, more usable format for the frontend.
        const cleanResults = entriesArray.map(entry => {
            let summary = 'Geen samenvatting beschikbaar.';
            if (entry?.summary) {
                // The summary can be a string or an object with a '_' property.
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

        // Return the successful response to the frontend.
        return {
            statusCode: 200,
            body: JSON.stringify({ results: cleanResults, total: totalResults })
        };

    } catch (error) {
        // Provide detailed error logging for easier debugging.
        const statusCode = error.response?.status || 500;
        const errorResponseData = error.response?.data ? JSON.stringify(error.response.data) : "Geen response data";
        const errorMessage = error.message;

        console.error(`Fout in serverless functie (Status: ${statusCode}):`, errorMessage);
        console.error("Response data van API:", errorResponseData);
        
        return {
            statusCode: statusCode,
            body: JSON.stringify({ 
                message: 'Er is een interne fout opgetreden bij het communiceren met de Rechtspraak API.', 
                error: errorMessage,
                details: errorResponseData
            })
        };
    }
};
            query, 
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
