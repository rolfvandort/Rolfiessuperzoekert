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
        
        // *** TERUGGEDRAAIDE AANPASSING ***
        // De regel `params.append('type', 'Uitspraak');` is verwijderd omdat deze de 502-fout veroorzaakte.

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
