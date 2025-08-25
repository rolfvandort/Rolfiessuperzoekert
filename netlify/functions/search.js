/**
 * @file search.js
 * @description Handles all client-side logic for searching the Rechtspraak.nl Open Data API.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const searchForm = document.getElementById('jurisprudentie-form');
    const resultsContainer = document.getElementById('results-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');
    const resultsSummarySpan = document.getElementById('results-summary');
    const paginationInfoSpan = document.getElementById('pagination-info');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const paginationContainer = document.getElementById('jurisprudentie-pagination');

    // Modal elements for optional full content view
    const contentModal = document.getElementById('content-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // --- Application State ---
    let currentPageOffset = 0;
    let totalResults = 0;
    let currentMax = 50;

    // --- Mappings & Constants ---
    const API_BASE_SEARCH_URL = 'https://data.rechtspraak.nl/uitspraken/zoeken';
    const API_BASE_CONTENT_URL = 'https://data.rechtspraak.nl/uitspraken/content';
    const subjectMap = {
        'Civiel recht': 'http://psi.rechtspraak.nl/rechtsgebied#civiel',
        'Strafrecht': 'http://psi.rechtspraak.nl/rechtsgebied#strafrecht',
        'Bestuursrecht': 'http://psi.rechtspraak.nl/rechtsgebied#bestuursrecht'
    };

    /**
     * Builds the API query URL from the form inputs.
     * @returns {string} The complete, URL-encoded API endpoint.
     */
    function buildQueryUrl() {
        const params = new URLSearchParams();

        // Read values from form fields
        const docType = document.getElementById('doc-type').value;
        const dateFrom = document.getElementById('date-from').value;
        const dateTo = document.getElementById('date-to').value;
        const modifiedFrom = document.getElementById('modified-from').value;
        const modifiedTo = document.getElementById('modified-to').value;
        const subject = document.getElementById('subject').value;
        const creator = document.getElementById('creator').value.trim();
        const maxResults = document.getElementById('max-results').value;
        const sortOrder = document.getElementById('sort-order').value;
        
        currentMax = parseInt(maxResults, 10) || 50;

        // Append parameters if they have a value
        if (docType) params.append('type', docType);
        if (dateFrom) params.append('date', dateFrom);
        if (dateTo) params.append('date', dateTo);

        // Format datetime-local value to the required API format (YYYY-MM-DDTHH:MM:SS)
        if (modifiedFrom) params.append('modified', modifiedFrom + ':00');
        if (modifiedTo) params.append('modified', modifiedTo + ':00');

        if (subject && subjectMap[subject]) {
            params.append('subject', subjectMap[subject]);
        }
        if (creator) params.append('creator', creator);

        params.append('max', currentMax);
        params.append('from', currentPageOffset);
        if(sortOrder === 'DESC') {
            // According to the documentation, sort=date only supports DESC order. 
            // ASC (oplopend) is the default and does not require a parameter.
            params.append('sort', 'date');
        }

        // The API returns XML, so we can set the return type parameter
        params.append('return', 'atom');

        return `${API_BASE_SEARCH_URL}?${params.toString()}`;
    }
    
    /**
     * Performs the search by fetching data from the API.
     * @param {boolean} isPagination - Indicates if this is a new search or a pagination action.
     */
    async function performSearch(isPagination = false) {
        if (!isPagination) {
            currentPageOffset = 0; // Reset for new search
        }

        loadingIndicator.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        errorMessageDiv.classList.add('hidden');
        paginationContainer.style.visibility = 'hidden';

        const url = buildQueryUrl();
        console.log(`Fetching: ${url}`); // For debugging purposes

        try {
            // Using the browser's native fetch API
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API Fout: ${response.status} ${response.statusText}. Controleer de zoekparameters.`);
            }
            const xmlString = await response.text();
            
            // Using the browser's native DOMParser
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

            // Check for XML parsing errors, which indicates a malformed response
            if (xmlDoc.getElementsByTagName("parsererror").length) {
                throw new Error("Fout bij het parsen van de XML-respons van de server.");
            }

            const entries = xmlDoc.querySelectorAll('entry');
            const subtitleElement = xmlDoc.querySelector('subtitle');
            const subtitleText = subtitleElement ? subtitleElement.textContent : "Aantal gevonden ECLI's: 0";
            
            updatePagination(subtitleText);
            displayResults(entries);

        } catch (error) {
            handleError(error.message);
        } finally {
            loadingIndicator.classList.add('hidden');
            resultsContainer.classList.remove('hidden');
        }
    }

    /**
     * Displays the search results in the results container.
     * @param {NodeListOf<Element>} entries - A list of <entry> elements from the XML response.
     */
    function displayResults(entries) {
        resultsContainer.innerHTML = ''; // Clear previous results
        
        if (entries.length === 0) {
            errorMessageDiv.textContent = 'Geen resultaten gevonden voor deze zoekopdracht.';
            errorMessageDiv.classList.remove('hidden');
            resultsContainer.appendChild(errorMessageDiv);
            return;
        }

        entries.forEach(entry => {
            const ecli = entry.querySelector('id')?.textContent || 'Geen ECLI';
            const title = entry.querySelector('title')?.textContent || 'Geen Titel';
            const summary = entry.querySelector('summary')?.textContent || 'Geen samenvatting beschikbaar.';

            const article = document.createElement('article');
            article.className = 'p-4 border rounded-md hover:bg-subtle hover:shadow-md cursor-pointer border-l-4 border-gray-200 hover:border-accent';
            article.dataset.ecli = ecli;

            article.innerHTML = `
                <h3 class="font-semibold text-primary text-md pointer-events-none">${title}</h3>
                <p class="text-sm text-gray-700 mt-2 pointer-events-none">${summary}</p>
                <p class="text-xs text-gray-500 mt-2 font-mono pointer-events-none">${ecli}</p>
            `;
            resultsContainer.appendChild(article);
        });
    }

    /**
     * Handles and displays error messages in the UI.
     * @param {string} message - The error message to display.
     */
    function handleError(message) {
        resultsContainer.innerHTML = '';
        errorMessageDiv.textContent = message;
        errorMessageDiv.classList.remove('hidden');
        resultsContainer.appendChild(errorMessageDiv);
        resultsSummarySpan.textContent = '';
        paginationContainer.style.visibility = 'hidden';
    }

    /**
     * Updates the pagination controls based on the total results.
     * @param {string} subtitleText - The text from the <subtitle> tag containing result count.
     */
    function updatePagination(subtitleText) {
        // Extract the number from a string like "Aantal gevonden ECLI's: 1234"
        const match = subtitleText.match(/\d+/);
        totalResults = match ? parseInt(match[0], 10) : 0;
        
        resultsSummarySpan.textContent = `Totaal: ${totalResults}`;

        if (totalResults > currentMax) {
            paginationContainer.style.visibility = 'visible';
            const startItem = currentPageOffset + 1;
            const endItem = Math.min(currentPageOffset + currentMax, totalResults);
            paginationInfoSpan.textContent = `${startItem} - ${endItem} van ${totalResults}`;

            prevPageBtn.disabled = currentPageOffset === 0;
            nextPageBtn.disabled = endItem >= totalResults;
        } else {
            paginationContainer.style.visibility = 'hidden';
        }
    }

    /**
     * Fetches and displays the full content of a specific ECLI in a modal window.
     * @param {string} ecli - The ECLI identifier of the document.
     */
    async function fetchFullContent(ecli) {
        modalTitle.textContent = ecli;
        modalContent.innerHTML = '<p>Inhoud wordt geladen...</p>';
        contentModal.classList.remove('hidden');

        const url = `${API_BASE_CONTENT_URL}?id=${encodeURIComponent(ecli)}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API Fout: ${response.statusText}`);
            }
            const xmlString = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            
            // The full content is inside the <uitspraak> or <conclusie> tag
            const contentElement = xmlDoc.querySelector('uitspraak, conclusie');

            if (contentElement) {
                // The API response often has HTML encoded entities, so we let the browser parse it
                modalContent.innerHTML = contentElement.innerHTML;
            } else {
                modalContent.innerHTML = '<p>De volledige inhoud kon niet worden geladen. Het is mogelijk dat de inhoud niet publiek beschikbaar is.</p>';
            }
        } catch (error) {
            modalContent.innerHTML = `<p class="text-red-500">Er is een fout opgetreden: ${error.message}</p>`;
        }
    }

    // --- Event Listeners Setup ---

    // Listen for form submission to start a new search
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault(); // This is crucial to prevent page reload
        performSearch(false);
    });

    // Listener for the 'previous page' button
    prevPageBtn.addEventListener('click', () => {
        if (currentPageOffset > 0) {
            currentPageOffset = Math.max(0, currentPageOffset - currentMax);
            performSearch(true);
        }
    });

    // Listener for the 'next page' button
    nextPageBtn.addEventListener('click', () => {
        const endItem = currentPageOffset + currentMax;
        if (endItem < totalResults) {
            currentPageOffset += currentMax;
            performSearch(true);
        }
    });

    // Event delegation for clicking on a result item to open the modal
    resultsContainer.addEventListener('click', (e) => {
        const resultArticle = e.target.closest('[data-ecli]');
        if (resultArticle) {
            const ecli = resultArticle.dataset.ecli;
            fetchFullContent(ecli);
        }
    });

    // Listener for closing the modal via the 'x' button
    modalCloseBtn.addEventListener('click', () => {
        contentModal.classList.add('hidden');
    });

    // Listener for closing the modal by clicking on the backdrop
    contentModal.addEventListener('click', (e) => {
        if (e.target === contentModal) {
            contentModal.classList.add('hidden');
        }
    });
});
