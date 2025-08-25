/**
 * @file search.js
 * @description Handles all client-side logic for the "Superzoeker" by calling our own backend function.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const searchForm = document.getElementById('jurisprudentie-form');
    const searchButton = document.querySelector('button[form="jurisprudentie-form"]');
    const resultsContainer = document.getElementById('results-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');
    const resultsSummarySpan = document.getElementById('results-summary');
    const paginationInfoSpan = document.getElementById('pagination-info');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const paginationContainer = document.getElementById('jurisprudentie-pagination');

    const contentModal = document.getElementById('content-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // --- Application State ---
    let currentPageOffset = 0;
    let totalResults = 0;
    let currentMax = 50;

    // --- Mappings & Constants ---
    const API_BACKEND_URL = '/api/search'; // Onze eigen Netlify serverless-functie!
    const subjectMap = {
        'Civiel recht': 'http://psi.rechtspraak.nl/rechtsgebied#civiel',
        'Strafrecht': 'http://psi.rechtspraak.nl/rechtsgebied#strafrecht',
        'Bestuursrecht': 'http://psi.rechtspraak.nl/rechtsgebied#bestuursrecht', // Komma was hier missing
        'Internationaal publiekrecht': 'http://psi.rechtspraak.nl/rechtsgebied#Internationaal publiekrecht'
    };

    /**
     * Builds the query URL for our own backend function.
     * @returns {string} The complete, URL-encoded API endpoint.
     */
    function buildQueryUrl() {
        const params = new URLSearchParams();
        const formData = new FormData(searchForm);

        currentMax = parseInt(formData.get('max-results'), 10) || 50;
        
        params.append('type', formData.get('doc-type'));
        if (formData.get('date-from')) params.append('date', formData.get('date-from'));
        if (formData.get('date-to')) params.append('date', formData.get('date-to'));
        if (formData.get('modified-from')) params.append('modified', formData.get('modified-from') + ':00');
        if (formData.get('modified-to')) params.append('modified', formData.get('modified-to') + ':00');
        
        const subject = formData.get('subject');
        if (subject && subjectMap[subject]) {
            params.append('subject', subjectMap[subject]);
        }
        
        if (formData.get('creator')) params.append('creator', formData.get('creator').trim());

        params.append('max', currentMax);
        params.append('from', currentPageOffset);
        
        if (formData.get('sort-order') === 'DESC') {
            params.append('sort', 'date');
        }

        params.append('return', 'atom');

        return `${API_BACKEND_URL}?${params.toString()}`;
    }

    /**
     * Performs the search by fetching data from our backend.
     * @param {boolean} isPagination - Indicates if this is a new search or a pagination action.
     */
    async function performSearch(isPagination = false) {
        if (!isPagination) {
            currentPageOffset = 0;
        }

        // --- UI Feedback Start ---
        loadingIndicator.classList.remove('hidden');
        resultsContainer.innerHTML = '';
        errorMessageDiv.classList.add('hidden');
        paginationContainer.style.visibility = 'hidden';
        searchButton.disabled = true;
        searchButton.textContent = 'Bezig...';

        const url = buildQueryUrl();
        console.log(`Frontend roept backend aan: ${url}`);

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok || !data.success) {
                // Toon de specifieke foutmelding van de backend
                throw new Error(data.error || 'Er is een onbekende fout opgetreden.');
            }
            
            totalResults = data.total;
            updatePagination();
            displayResults(data.results);

        } catch (error) {
            handleError(error.message);
        } finally {
            // --- UI Feedback Einde ---
            loadingIndicator.classList.add('hidden');
            searchButton.disabled = false;
            searchButton.textContent = 'Zoeken';
        }
    }

    /**
     * Displays the search results from the clean JSON object.
     * @param {Array} results - An array of result objects from our backend.
     */
    function displayResults(results) {
        if (results.length === 0) {
            errorMessageDiv.textContent = 'Geen resultaten gevonden voor deze zoekopdracht.';
            errorMessageDiv.classList.remove('hidden');
            return;
        }

        results.forEach(item => {
            const article = document.createElement('article');
            article.className = 'p-4 border rounded-md hover:bg-subtle hover:shadow-md cursor-pointer border-l-4 border-gray-200 hover:border-accent';
            article.dataset.ecli = item.id;

            article.innerHTML = `
                <h3 class="font-semibold text-primary text-md pointer-events-none">${item.title}</h3>
                <p class="text-sm text-gray-700 mt-2 pointer-events-none">${item.summary}</p>
                <p class="text-xs text-gray-500 mt-2 font-mono pointer-events-none">${item.id}</p>
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
        resultsSummarySpan.textContent = '';
        paginationContainer.style.visibility = 'hidden';
    }

    /**
     * Updates the pagination controls.
     */
    function updatePagination() {
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

    async function fetchFullContent(ecli) {
        // Deze functie kan hetzelfde blijven, aangezien de content API wellicht andere CORS-regels heeft
        // of we kunnen hiervoor ook een backend proxy maken als het nodig is. Voor nu laten we het zo.
        modalTitle.textContent = ecli;
        modalContent.innerHTML = '<div id="jurisprudentie-loader"></div>';
        contentModal.classList.remove('hidden');
        
        // We gebruiken een proxy voor de content-API voor de zekerheid en consistentie.
        const url = `/api/search-content?id=${encodeURIComponent(ecli)}`; // Aanname: we maken een tweede proxy-functie
        
        // Omdat we geen tweede functie hebben afgesproken, gebruiken we voor nu de directe call.
        // Als dit faalt met CORS, is de volgende stap een 'search-content' functie te maken.
        const directUrl = `https://data.rechtspraak.nl/uitspraken/content?id=${encodeURIComponent(ecli)}`;

        try {
            const response = await fetch(directUrl);
            if (!response.ok) throw new Error(`API Fout: ${response.statusText}`);
            
            const xmlString = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            
            const contentElement = xmlDoc.querySelector('uitspraak, conclusie');
            modalContent.innerHTML = contentElement ? contentElement.innerHTML : '<p>De volledige inhoud kon niet worden geladen.</p>';

        } catch (error) {
            modalContent.innerHTML = `<p class="text-red-500">Kon inhoud niet laden. Het is mogelijk dat de directe API-aanroep ook door CORS wordt geblokkeerd. Fout: ${error.message}</p>`;
        }
    }

    // --- Event Listeners Setup ---
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performSearch(false);
    });

    prevPageBtn.addEventListener('click', () => {
        if (currentPageOffset > 0) {
            currentPageOffset = Math.max(0, currentPageOffset - currentMax);
            performSearch(true);
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const endItem = currentPageOffset + currentMax;
        if (endItem < totalResults) {
            currentPageOffset += currentMax;
            performSearch(true);
        }
    });

    resultsContainer.addEventListener('click', (e) => {
        const resultArticle = e.target.closest('[data-ecli]');
        if (resultArticle) {
            fetchFullContent(resultArticle.dataset.ecli);
        }
    });

    modalCloseBtn.addEventListener('click', () => contentModal.classList.add('hidden'));
    contentModal.addEventListener('click', (e) => {
        if (e.target === contentModal) contentModal.classList.add('hidden');
    });
});
