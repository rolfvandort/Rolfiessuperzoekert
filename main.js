/**
 * @file search.js
 * @description Handles all client-side logic for the "Superzoeker".
 */

// Globale state om de geladen filterdata op te slaan
window.rechtsspraakData = {
    instanties: [],
    rechtsgebieden: [],
    procedures: []
};

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const jurisprudentiePage = document.getElementById('jurisprudentie-page');
    const searchForm = document.getElementById('jurisprudentie-form');
    const searchButton = document.querySelector('button[form="jurisprudentie-form"]');
    const resetButton = document.getElementById('jurisprudentie-reset-btn');
    const resultsContainer = document.getElementById('results-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');
    const resultsSummarySpan = document.getElementById('results-summary');
    const paginationInfoSpan = document.getElementById('pagination-info');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const paginationContainer = document.getElementById('jurisprudentie-pagination');
    const filtersLoadingIndicator = document.getElementById('filters-loading-indicator');

    const contentModal = document.getElementById('content-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // --- Application State ---
    let currentPageOffset = 0;
    let totalResults = 0;
    let currentMax = 50;
    let filtersInitialized = false;

    // --- Mappings & Constants ---
    const API_BACKEND_URL = '/api/search';
    const API_CONTENT_URL = '/api/search-content';

    /**
     * Initialiseert de Superzoeker door de benodigde filterdata op te halen en te verwerken.
     * Wordt maar één keer uitgevoerd.
     */
    async function initializeSuperZoeker() {
        if (filtersInitialized) return;
        filtersInitialized = true;

        try {
            const [instantiesXml, rechtsgebiedenXml, proceduresXml] = await Promise.all([
            fetch('/public/api-data/Instanties.xml').then(res => res.text()),
            fetch('/public/api-data/Rechtsgebieden.xml').then(res => res.text()),
            fetch('/public/api-data/Proceduresoorten.xml').then(res => res.text())
            ]);
            const parser = new DOMParser();

            // Verwerk Instanties
            const instantiesDoc = parser.parseFromString(instantiesXml, "application/xml");
            const instantiesNode = instantiesDoc.querySelector("Instanties");
            if (!instantiesNode) throw new Error("Root element <Instanties> niet gevonden in Instanties.xml.");
            window.rechtsspraakData.instanties = Array.from(instantiesNode.children).map(node => ({
                naam: node.querySelector('Naam').textContent.trim(),
                identifier: node.querySelector('Identifier').textContent.trim(),
                afkorting: node.querySelector('Afkorting')?.textContent.trim() || ''
            }));
            populateInstantiesDatalist();

            // Verwerk Rechtsgebieden
            const rechtsgebiedenDoc = parser.parseFromString(rechtsgebiedenXml, "application/xml");
            const rechtsgebiedenNode = rechtsgebiedenDoc.querySelector("Rechtsgebieden");
            if (!rechtsgebiedenNode) throw new Error("Root element <Rechtsgebieden> niet gevonden in Rechtsgebieden.xml.");
            window.rechtsspraakData.rechtsgebieden = Array.from(rechtsgebiedenNode.children).map(parseRechtsgebiedNode);
            populateRechtsgebiedenTree();
            
            // Verwerk Procedures
            const proceduresDoc = parser.parseFromString(proceduresXml, "application/xml");
            const proceduresNode = proceduresDoc.querySelector("Proceduresoorten");
            if (!proceduresNode) throw new Error("Root element <Proceduresoorten> niet gevonden in Proceduresoorten.xml.");
            window.rechtsspraakData.procedures = Array.from(proceduresNode.children).map(node => ({
                naam: node.querySelector('Naam').textContent.trim(),
                identifier: node.querySelector('Identifier').textContent.trim()
            })).sort((a,b) => a.naam.localeCompare(b.naam));
            populateProceduresList();
            
            filtersLoadingIndicator.textContent = 'Klaar';
            filtersLoadingIndicator.classList.add('text-green-600');
        } catch (error) {
            console.error("Fout bij laden van filterdata:", error);
            filtersLoadingIndicator.innerHTML = `Fout bij laden. <br>Controleer of de .xml bestanden in /public/api-data/ staan.`;
            filtersLoadingIndicator.classList.add('text-red-600');
        }
    }
    
    /**
     * Helper functies voor het vullen van de UI
     */
    function populateInstantiesDatalist() {
        const datalist = document.getElementById('instanties-datalist');
        if (!datalist) return;
        datalist.innerHTML = '';
        window.rechtsspraakData.instanties.forEach(inst => {
            const option = document.createElement('option');
            option.value = inst.naam;
            option.textContent = inst.afkorting ? `(${inst.afkorting})` : '';
            datalist.appendChild(option);
        });
    }

    function parseRechtsgebiedNode(node) {
        // :scope zorgt ervoor dat we alleen directe kinderen selecteren
        const children = Array.from(node.querySelectorAll(':scope > Rechtsgebied')).map(parseRechtsgebiedNode);
        return {
            naam: node.querySelector(':scope > Naam').textContent.trim(),
            identifier: node.querySelector(':scope > Identifier').textContent.trim(),
            children: children
        };
    }

    function populateRechtsgebiedenTree() {
        const container = document.getElementById('subject-container');
        if (!container) return;
        const treeHtml = window.rechtsspraakData.rechtsgebieden.map(createRechtsgebiedNodeHtml).join('');
        container.innerHTML = `<ul class="space-y-1">${treeHtml}</ul>`;
    }

    function createRechtsgebiedNodeHtml(node) {
        const hasChildren = node.children.length > 0;
        const childrenHtml = hasChildren ? `<ul class="pl-4 space-y-1 mt-1">${node.children.map(createRechtsgebiedNodeHtml).join('')}</ul>` : '';
        const itemContent = `
            <label class="flex items-center space-x-2 text-sm cursor-pointer">
                <input type="checkbox" name="subject" class="rounded border-gray-300 text-primary focus:ring-primary" data-identifier="${node.identifier}">
                <span>${node.naam}</span>
            </label>
        `;
        
        if (hasChildren) {
            return `<li><details><summary class="p-1 rounded hover:bg-gray-100">${itemContent}</summary>${childrenHtml}</details></li>`;
        }
        return `<li>${itemContent}</li>`;
    }
    
    function populateProceduresList() {
        const container = document.getElementById('procedure-container');
        if (!container) return;
        container.innerHTML = '<ul>' + window.rechtsspraakData.procedures.map(proc => `
            <li>
                <label class="flex items-center space-x-2 text-sm cursor-pointer">
                    <input type="checkbox" name="procedure" class="rounded border-gray-300 text-primary focus:ring-primary" data-identifier="${proc.identifier}">
                    <span>${proc.naam}</span>
                </label>
            </li>
        `).join('') + '</ul>';
    }


    /**
     * Bouwt de query URL voor onze eigen backend functie.
     * @returns {string} De complete, URL-encoded API endpoint.
     */
    function buildQueryUrl() {
        const params = new URLSearchParams();
        const formData = new FormData(searchForm);

        currentMax = parseInt(formData.get('max'), 10) || 50;
        
        // Vrije tekst en ID
        if (formData.get('q')) params.append('q', formData.get('q'));
        if (formData.get('id')) params.append('id', formData.get('id'));

        // Vertaal 'Type'
        const docType = formData.get('type');
        if (docType === 'Uitspraak' || docType === 'Conclusie') {
            params.append('type', docType);
        }
        
        // Vertaal 'Instantie'
        const creatorName = formData.get('creator').trim();
        if (creatorName) {
            const inst = window.rechtsspraakData.instanties.find(i => i.naam.toLowerCase() === creatorName.toLowerCase() || (i.afkorting && i.afkorting.toLowerCase() === creatorName.toLowerCase()));
            if (inst) {
                params.append('creator', inst.identifier);
            } else {
                // Fallback voor als de gebruiker iets intypt wat niet in de lijst staat maar wel geldig is (onwaarschijnlijk)
                params.append('creator', creatorName); 
            }
        }
        
        // Verzamel geselecteerde Rechtsgebieden
        const selectedSubjects = Array.from(document.querySelectorAll('#subject-container input[name="subject"]:checked'))
            .map(cb => cb.dataset.identifier).join(',');
        if (selectedSubjects) params.append('subject', selectedSubjects);
        
        // Verzamel geselecteerde Procedures
        const selectedProcedures = Array.from(document.querySelectorAll('#procedure-container input[name="procedure"]:checked'))
            .map(cb => cb.dataset.identifier).join(',');
        if (selectedProcedures) params.append('procedure', selectedProcedures);
            
        // Datums
        if (formData.get('date-from')) params.append('date-start', formData.get('date-from'));
        if (formData.get('date-to')) params.append('date-end', formData.get('date-to'));
        if (formData.get('issued-from')) params.append('issued-start', formData.get('issued-from'));
        if (formData.get('issued-to')) params.append('issued-end', formData.get('issued-to'));
        
        // Paginatie en sortering
        params.append('max', currentMax);
        params.append('from', currentPageOffset);
        if (formData.get('return-sort') === 'ASC') params.append('sort', 'date');

        // Vereist formaat
        params.append('return', 'atom');

        return `${API_BACKEND_URL}?${params.toString()}`;
    }

    /**
     * Voert de zoekopdracht uit.
     */
    async function performSearch(isPagination = false) {
        if (!isPagination) {
            currentPageOffset = 0;
        }

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
                throw new Error(data.error || 'Er is een onbekende fout opgetreden.');
            }
            
            totalResults = data.total;
            updatePagination();
            displayResults(data.results);

        } catch (error) {
            handleError(error.message);
        } finally {
            loadingIndicator.classList.add('hidden');
            searchButton.disabled = false;
            searchButton.textContent = 'Zoeken';
        }
    }

    /**
     * Toont de zoekresultaten in de UI.
     */
    function displayResults(results) {
        if (results.length === 0) {
            errorMessageDiv.textContent = 'Geen resultaten gevonden voor deze zoekopdracht.';
            errorMessageDiv.classList.remove('hidden');
            resultsSummarySpan.textContent = 'Totaal: 0';
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
     * Toont foutmeldingen in de UI.
     */
    function handleError(message) {
        resultsContainer.innerHTML = '';
        errorMessageDiv.textContent = `Fout: ${message}`;
        errorMessageDiv.classList.remove('hidden');
        resultsSummarySpan.textContent = '';
        paginationContainer.style.visibility = 'hidden';
    }

    /**
     * Werkt de paginatie-knoppen en informatie bij.
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
    
    /**
     * Haalt de volledige inhoud van een uitspraak op via de backend proxy.
     */
    async function fetchFullContent(ecli) {
        modalTitle.textContent = ecli;
        modalContent.innerHTML = '<div class="flex justify-center items-center h-full"><div id="jurisprudentie-loader"></div></div>';
        contentModal.classList.remove('hidden');
        
        const url = `${API_CONTENT_URL}?id=${encodeURIComponent(ecli)}`;

        try {
            const response = await fetch(url);
            
            // Controleer of de response XML is, anders is het een JSON error van de proxy
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API Fout: ${response.statusText}`);
            }

            if (!response.ok) {
                 throw new Error(`API Fout: ${response.statusText}`);
            }
            
            const xmlString = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            
            const parserError = xmlDoc.querySelector("parsererror");
            if (parserError) {
                console.error("XML Parse Error:", parserError.textContent);
                throw new Error("Ongeldig XML-formaat ontvangen van de server.");
            }
            
            const contentElement = xmlDoc.querySelector('uitspraak, conclusie');
            if (contentElement) {
                // De innerHTML van een XML-element kan direct worden gebruikt omdat het al een gestructureerde opmaak bevat.
                // Moderne browsers saniteren dit tot op zekere hoogte bij het renderen.
                modalContent.innerHTML = new XMLSerializer().serializeToString(contentElement);
            } else {
                 modalContent.innerHTML = '<p>De volledige inhoud kon niet worden gevonden in het ontvangen document.</p>';
            }

        } catch (error) {
            modalContent.innerHTML = `<p class="text-red-500">Kon inhoud niet laden. Fout: ${error.message}</p>`;
        }
    }

    // --- Event Listeners Setup ---
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performSearch(false);
    });
    
    resetButton.addEventListener('click', () => {
        searchForm.reset();
        document.querySelectorAll('.filter-checkbox-container input').forEach(cb => cb.checked = false);
        // We voeren een nieuwe, lege zoekopdracht uit om de resultaten te wissen
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
    
    // Initialiseer de filters alleen wanneer de jurisprudentiepagina zichtbaar wordt.
    // Dit kan via een MutationObserver of een simpele check in de showPage functie.
    // Voor nu roepen we het direct aan.
    initializeSuperZoeker();
});
