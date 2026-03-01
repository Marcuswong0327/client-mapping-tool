
const jobUrlInput = document.getElementById('jobUrl');
const extractBtn = document.getElementById('extractBtn');
const exportBtn = document.getElementById('exportBtn');
const statusDiv = document.getElementById('status');
const progressFill = document.getElementById('progressFill');

const multiUrlsInput = document.getElementById('multiUrls');
const multiExtractBtn = document.getElementById('multiExtractBtn');
const copyPasteUrlsBtn = document.getElementById('copyPasteUrlsBtn');
const multiStatusDiv = document.getElementById('multiStatus');
const multiProgressFill = document.getElementById('multiProgressFill');
const multiDetailsDiv = document.getElementById('multiDetails');
const githubGistTokenInput = document.getElementById('githubGistToken');

// Master stakeholder upload (Excel/CSV)
const masterFileInput = document.getElementById('masterFileInput');
const masterDropzone = document.getElementById('masterDropzone');
const masterUploadMeta = document.getElementById('masterUploadMeta');
const masterUploadStatus = document.getElementById('masterUploadStatus');

const errorPreviewSection = document.getElementById('errorPreviewSection');
const errorToggleBtn = document.getElementById('errorToggleBtn');
const errorToggleIcon = document.getElementById('errorToggleIcon');
const errorToggleText = document.getElementById('errorToggleText');
const errorPreviewContent = document.getElementById('errorPreviewContent');
const errorCount = document.getElementById('errorCount');
const copyErrorUrlsBtn = document.getElementById('copyErrorUrlsBtn');
const errorList = document.getElementById('errorList');

let extractedJobs = [];
let multiExtractedJobs = [];
let extractionErrors = [];
let isExporting = false; // Flag to prevent double downloads


document.addEventListener('DOMContentLoaded', function () {
    // Tool Navigation
    const toolBtns = document.querySelectorAll('.tool-btn');
    const toolSections = document.querySelectorAll('.tool-section');

    toolBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const toolName = this.getAttribute('data-tool');

            // Update active button
            toolBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Show corresponding section
            toolSections.forEach(s => s.classList.remove('active'));
            document.getElementById(`${toolName}-tool`).classList.add('active');
        });
    });
});
class JobExtractor {

    constructor() {
        const run = () => this._getChromeMessages();
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            run();
        } else {
            document.addEventListener('DOMContentLoaded', run);
        }
    }

    _isValidSeekSearchURL(url) {

        if (!url || url === 'N/A' || !url.startsWith('http')) {
            return false;
        }
        // Check if it's a Seek URL with job listing pattern
        if (!url.includes('seek.com') || (!url.includes('/job/') && !url.includes('/jobs/') && !url.includes('jobId'))) {
            return false;
        }
        return true;
    };

    _updateStatus(message, type = '') {

        statusDiv.textContent = message;
        statusDiv.className = 'status-message ' + type;
    }


    _updateProgress(percentage) {
        progressFill.style.width = percentage + '%';
    }

    _updateMultiStatus(message, type = '') {
        multiStatusDiv.textContent = message;
        multiStatusDiv.className = 'status-message ' + type;
    }

    _updateMultiProgress(percentage) {
        multiProgressFill.style.width = percentage + '%';
    }

    _normalizeText(str) {
        if (!str) return str;
        return str
            .replace(/â€"/g, "-")
            .replace(/Â/g, "")
            .replace(/–/g, "-")
            .replace(/—/g, "-")
    }

    _getChromeMessages() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'scrapingProgress') {
                this._updateStatus(`Extracting page ${request.page} (${request.jobCount} jobs found)`, 'loading');
                const estimatedProgress = Math.min((request.page / 10) * 100, 90);
                this._updateProgress(estimatedProgress);
            } else if (request.action === 'scrapingComplete') {
                extractedJobs = request.jobs;
                this._updateStatus(`Extraction completed! Found ${request.jobs.length} jobs across ${request.totalPages} pages`, 'success');
                this._updateProgress(100);
                exportBtn.disabled = false;
                extractBtn.disabled = false;
            } else if (request.action === 'scrapingError') {
                this._updateStatus('Error: ' + request.error, 'error');
                extractBtn.disabled = false;
                this._updateProgress(0);
            } else if (request.action === 'multiExtractionProgress') {
                const { current, total, results, errors } = request.progress;
                const percentage = (current / total) * 100;
                this._updateMultiProgress(percentage);
                this._updateMultiStatus(`Processing ${current} of ${total} URLs...`, 'loading');
                multiDetailsDiv.textContent = `Extracted ${results}`;

            } else if (request.action === 'multiExtractionComplete') {
                multiExtractedJobs = request.results;
                extractionErrors = request.errors;
                const totalUrls = request.results.length + request.errors.length;
                this._updateMultiStatus(`Complete! Extracted ${request.results.length} of ${totalUrls} jobs`, 'success');
                this._updateMultiProgress(100);
                multiDetailsDiv.textContent = `Extracted ${request.results.length} | Error: ${request.errors.length}`;
                multiExtractBtn.disabled = false;

                if (typeof this._exportJobsWithStakeholders === 'function' && request.results.length > 0 && !isExporting) {
                    isExporting = true;
                    setTimeout(async () => {
                        try {
                            await this._exportJobsWithStakeholders(request.results);
                        } catch (error) {
                            console.error('Auto-export failed:', error);
                            this._updateMultiStatus('Auto-export failed: ' + error.message, 'error');
                        } finally {
                            isExporting = false;
                        }
                    }, 500);
                }

                if (typeof this._displayErrorPreview === 'function' && request.errors.length > 0) {
                    console.warn('Extraction errors:', request.errors);
                    this._displayErrorPreview(request.errors);
                }
            }
        });
    };


};

class SingleSeekURLJobExtractor extends JobExtractor {

    constructor() {
        super();
        const run = () => {
            this._extractFromSingleURL();
            this._exportFromSingleURL();
            this._getSeekSearchURL();
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            run();
        } else {
            document.addEventListener('DOMContentLoaded', run);
        }
    }

    _extractFromSingleURL() {
        extractBtn.addEventListener('click', async () => {
            const url = jobUrlInput.value.trim();

            if (!url) {
                this._updateStatus('Please enter a job search URL', 'error');
                return;
            }

            if (!url.includes('seek.com')) {
                this._updateStatus('Please enter a valid Seek URL', 'error');
                return;
            }

            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

                await chrome.tabs.update(tab.id, { url: url });

                await new Promise(resolve => {
                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === tab.id && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    });
                });

                extractBtn.disabled = true;
                this._updateStatus('Starting job extraction...', 'loading');
                this._updateProgress(0);

                chrome.tabs.sendMessage(tab.id, { action: 'startScraping' });

            } catch (error) {
                this._updateStatus('Error: ' + error.message, 'error');
                extractBtn.disabled = false;
            }
        });
    }

    _exportFromSingleURL() {
        exportBtn.addEventListener('click', () => {
            if (extractedJobs.length === 0) {
                this._updateStatus('No jobs to export', 'error');
                return;
            }

            this._exportToExcel(extractedJobs, 'job_search_extraction');
        });
    }

    _exportToExcel(jobs, filename) {
        if (jobs.length === 0) return;

        const headers = ['Job Title', 'Company', 'Location', 'Salary', 'Job URL'];
        const csvContent = [
            headers.join(','),
            ...jobs.map(job => [
                `"${this._normalizeText(job.jobTitle).replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.company).replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.location).replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.salary).replace(/"/g, '""')}"`,
                `"${job.jobUrl}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const csvFilename = `${filename}.csv`;

        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
            url: url,
            filename: csvFilename,
            saveAs: true
        }, function (downloadId) {
            if (chrome.runtime.lastError) {
                this._updateStatus('Export failed: ' + chrome.runtime.lastError.message, 'error');
            } else {
                this._updateStatus('Successfully exported', 'success');
            }
            URL.revokeObjectURL(url);
        });
    }

    _getSeekSearchURL() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const currentUrl = tabs[0].url;
            if (currentUrl && (currentUrl.includes('seek.com.au'))) {
                jobUrlInput.value = currentUrl;
                chrome.storage.local.set({ savedUrl: currentUrl });
            }
        });
    };

};

class MultipleSeekURLJobExtractor extends JobExtractor {

    #masterFile;

    constructor() {
        super();
        const run = () => {
            this._handleMasterUploadUI();
            this._loadMasterMetaOnStart();
            this._loadGistsToken();
            this._copyMultipleSeekJobURL();
            this._extractFromMultipleURL();
            this._displayFailedMultipleURL();
            this._handleFailedMultipleURL();
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            run();
        } else {
            document.addEventListener('DOMContentLoaded', run);
        }
    }

    async _handleMasterFileUpload(file) {

        this.#masterFile = file;

        if (!this.#masterFile) return;

        masterUploadStatus.textContent = "Reading file...";
        masterUploadStatus.className = 'status-message loading';

        try {
            let matrix = [];

            if (typeof XLSX === 'undefined') {
                throw new Error('Excel parser not available (XLSX missing)');
            }

            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const firstSheetName = wb.SheetNames[0] ?? null;

            if (!firstSheetName) {
                throw new Error('No sheets found in workbook');
            }
            const ws = wb.Sheets[firstSheetName];
            matrix = XLSX.utils.sheet_to_json(ws, {
                header: 1,
                blankrows: false,
                defval: ''
            });

            // if matrix is not an array and no data 
            if (!Array.isArray(matrix) || matrix.length < 2) {
                throw new Error('Master file looks empty (need header + at least 1 row)');
            }

            const meta = {
                filename: file.name || 'master',
                rows: matrix.length,
            };

            await chrome.storage.local.set({ masterValues: matrix, masterMeta: meta });

            if (masterUploadMeta) {
                masterUploadMeta.textContent = `${meta.filename}, ${(meta.rows) - 1} rows`;
            }
            masterUploadStatus.textContent = "Uploaded & stored successfully";
            masterUploadStatus.className = "status-message success";

        } catch (e) {
            console.error('Master upload failed:', e);
            masterUploadStatus.textContent = "Fail to upload" + e.message;
            masterUploadStatus.className = "status-message error";
        }
    };

    async _loadMasterMetaOnStart() {
        try {
            const { masterMeta } = await chrome.storage.local.get(['masterMeta']);
            if (masterMeta && masterUploadMeta) {
                masterUploadMeta.textContent = `${masterMeta.filename}`;
                masterUploadStatus.textContent = "File loaded from previous upload";
                masterUploadStatus.className = "status-message success";
            }
        } catch (e) {
            console.error('File could not load from previous upload', e.message);
            masterUploadStatus.textContent = 'Fail to load file from previous upload' + e.message;
            masterUploadStatus.className = "status-message error";
        }
    };

    _loadGistsToken() { //if any
        if (githubGistTokenInput) {
            chrome.storage.local.get(['githubGistToken'], function (result) {
                if (result.githubGistToken) {
                    githubGistTokenInput.value = result.githubGistToken;
                }
            });

            githubGistTokenInput.addEventListener('input', function () {
                chrome.storage.local.set({ githubGistToken: githubGistTokenInput.value });
            });
        }
    };

    _copyMultipleSeekJobURL() {
        copyPasteUrlsBtn.addEventListener('click', async () => {
            try {
                const tabs = await chrome.tabs.query({ currentWindow: true });

                if (tabs.length === 0) {
                    this._updateMultiStatus('No tabs found in current window', 'error');
                    return;
                }

                const seekJobUrls = tabs
                    .map(tab => tab.url)
                    .filter(url => this._isValidSeekSearchURL(url));

                if (seekJobUrls.length === 0) {
                    this._updateMultiStatus('No Seek job URLs found in current tabs', 'error');
                    return;
                }

                multiUrlsInput.value = seekJobUrls.join('\n');
                this._updateMultiStatus(`Copied ${seekJobUrls.length} Seek job URL(s)`, 'success');
            } catch (error) {
                this._updateMultiStatus('Error: ' + error.message, 'error');
            }
        });
    }

    _handleMasterUploadUI() {
        // Master upload UI wiring
        if (masterDropzone && masterFileInput) {
            this._loadMasterMetaOnStart();

            masterDropzone.addEventListener('click', () => masterFileInput.click());
            masterDropzone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    masterFileInput.click();
                }
            });

            masterFileInput.addEventListener('change', async (e) => {
                this.#masterFile = e.target.files && e.target.files[0];
                await this._handleMasterFileUpload(this.#masterFile);
                masterFileInput.value = '';
            });

            masterDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                masterDropzone.classList.add('dragover');
            });
            masterDropzone.addEventListener('dragleave', () => {
                masterDropzone.classList.remove('dragover');
            });
            masterDropzone.addEventListener('drop', async (e) => {
                e.preventDefault();
                masterDropzone.classList.remove('dragover');
                this.#masterFile = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                await this._handleMasterFileUpload(this.#masterFile);
            });
        }
    };

    _extractFromMultipleURL() {
        multiExtractBtn.addEventListener('click', async () => {
            const urlsText = multiUrlsInput.value.trim();

            if (!urlsText) {
                this._updateMultiStatus('Please enter at least one job URL', 'error');
                return;
            }

            const urls = urlsText.split('\n')
                .map(url => url.trim())
                .filter(url => url.length > 0);

            if (urls.length === 0) {
                this._updateMultiStatus('Please enter valid URLs', 'error');
                return;
            }

            const invalidUrls = urls.filter(url => !url.includes('seek.com.au/job'));
            if (invalidUrls.length > 0) {
                this._updateMultiStatus(`Found ${invalidUrls.length} invalid URL. Please use Seek job listing URLs.`, 'error');
                return;
            }

            multiExtractBtn.disabled = true;
            this._updateMultiStatus(`Extracting ${urls.length} job(s)...`, 'loading');
            this._updateMultiProgress(0);
            multiDetailsDiv.textContent = "Initializing..."

            extractionErrors = [];
            errorPreviewSection.style.display = 'none';
            errorPreviewContent.style.display = 'none';
            errorToggleIcon.classList.remove('expanded');

            chrome.runtime.sendMessage({
                action: 'startMultiExtraction',
                urls: urls
            });
        });
    }

    _displayFailedMultipleURL() {
        errorToggleBtn.addEventListener('click', function () {
            const isExpanded = errorPreviewContent.style.display === 'block';

            if (isExpanded) {
                errorPreviewContent.style.display = 'none';
                errorToggleIcon.classList.remove('expanded');
                errorToggleText.textContent = 'Show Failed URLs';
            } else {
                errorPreviewContent.style.display = 'block';
                errorToggleIcon.classList.add('expanded');
                errorToggleText.textContent = 'Hide Failed URLs';
            }
        });
    };

    _handleFailedMultipleURL() {
        copyErrorUrlsBtn.addEventListener('click', function () {
            if (extractionErrors.length === 0) return;

            const urlsToCopy = extractionErrors.map(err => err.url).join('\n');

            navigator.clipboard.writeText(urlsToCopy).then(() => {
                const originalText = copyErrorUrlsBtn.textContent;
                copyErrorUrlsBtn.textContent = 'Copied!';
                copyErrorUrlsBtn.style.backgroundColor = '#28a745';

                setTimeout(() => {
                    copyErrorUrlsBtn.textContent = originalText;
                    copyErrorUrlsBtn.style.backgroundColor = '#007bff';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy URLs:', err);
                copyErrorUrlsBtn.textContent = 'Copy Failed';
                setTimeout(() => {
                    copyErrorUrlsBtn.textContent = 'Copy All URLs';
                }, 2000);
            });
        });
    };

    _exportMultiToExcel(jobs) {
        if (jobs.length === 0) return;

        const headers = ['State', 'Suburbs', 'Job Title', 'Company Name', 'Salary', 'Posted Date', 'Contact Email', 'URL'];
        const csvContent = [
            headers.join(','),
            ...jobs.map(job => [
                `"${this._normalizeText(job.state || '').replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.suburbs || '').replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.jobTitle || '').replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.company || '').replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.salary || '').replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.postedDate || '').replace(/"/g, '""')}"`,
                `"${this._normalizeText(job.contactEmail || '').replace(/"/g, '""')}"`,
                `"${job.url || ''}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = `seek_job_data.csv`;

        const url = URL.createObjectURL(blob)
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        }, function (downloadId) {
            if (chrome.runtime.lastError) {
                this._updateMultiStatus('Export failed: ' + chrome.runtime.lastError.message, 'error');
            } else {
                this._updateMultiStatus(`Downloaded ${jobs.length} jobs`, 'success');
            }
            URL.revokeObjectURL(url);
        });
    }

    _cleanCompanyNameForMatch(name) {
        if (!name || name.length === 0) return '';
        let s = name.toUpperCase();
        s = s.replace(/[^A-Z0-9\s]/g, '');

        //const noiseRegex = /\b(PTY|LTD|LIMITED|INC|CORPORATION|GROUP|AUSTRALIA|HOLDINGS|SOLUTIONS|SYSTEMS|SERVICES|DEVELOPMENTS)\b/g;

        //s = s.replace(noiseRegex, '');
        return s.replace(/\s+/g, ' ').trim();
    }

    _buildStakeholderMapFromMaster(masterValues) {
        const mCol_Nature = 0;
        const mCol_Company = 1;
        const mCol_Suburb = 2;
        const mCol_State = 3;
        const mCol_Job = 4;
        const mCol_FirstName = 5;
        const mCol_FullName = 6;
        const mCol_Title = 7;
        const mCol_Email = 8;
        const mCol_History1 = 9;
        const mCol_History2 = 10;
        const mCol_History3 = 11;
        const mCol_History4 = 12;

        const companyMap = new Map();
        let lastCompany = '';
        let lastNature = '';

        for (let i = 1; i < masterValues.length; i++) {
            const row = masterValues[i];
            if (!row) continue;

            const rawCompany = row[mCol_Company];
            const rawNature = row[mCol_Nature];

            // Fill‑down logic: company and nature
            if (rawCompany && rawCompany.toString().trim() !== '') {
                lastCompany = rawCompany.toString();
            }
            if (rawNature && rawNature.toString().trim() !== '') {
                lastNature = rawNature.toString();
            }

            // Skip rows until we've seen at least one company name
            if (!lastCompany) {
                continue;
            }

            const cleanComp = this._cleanCompanyNameForMatch(lastCompany);

            const stakeholder = {
                nature: lastNature || '',
                company: lastCompany || '',
                suburb: row[mCol_Suburb] ? row[mCol_Suburb].toString() : '',
                state: row[mCol_State] ? row[mCol_State].toString() : '',
                job: row[mCol_Job] ? row[mCol_Job].toString() : '',
                firstName: row[mCol_FirstName] ? row[mCol_FirstName].toString() : '',
                fullName: row[mCol_FullName] ? row[mCol_FullName].toString() : '',
                title: row[mCol_Title] ? row[mCol_Title].toString() : '',
                email: row[mCol_Email] ? row[mCol_Email].toString() : '',
                history1: row[mCol_History1] ? row[mCol_History1].toString() : '',
                history2: row[mCol_History2] ? row[mCol_History2].toString() : '',
                history3: row[mCol_History3] ? row[mCol_History3].toString() : '',
                history4: row[mCol_History4] ? row[mCol_History4].toString() : ''
            };

            if (!companyMap.has(cleanComp)) {
                companyMap.set(cleanComp, []);
            }

            companyMap.get(cleanComp).push(stakeholder);
        }

        return companyMap;
    }

    _buildJobListingMatrixFromJobs(jobs) {
        const headers = ['State', 'Suburbs', 'Job Title', 'Company Name', 'Salary', 'Posted Date', 'Contact Email', 'URL'];

        const rows = jobs.map(job => [
            job.state || '',
            job.suburbs || '',
            job.jobTitle || '',
            job.company || '',
            job.salary || '',
            job.postedDate || '',
            job.contactEmail || '',
            job.url || ''
        ]);

        return [headers, ...rows];
    }

    _mergeJobsWithStakeholders(masterValues, jobValues) {
        const companyMap = this._buildStakeholderMapFromMaster(masterValues);
        const jCol_Company = 3; // "Company Name" column in job listing

        const outputData = [];
        const headers = jobValues[0] || [];
        const newHeaders = [
            ...headers,
            'Business Nature',
            'Company',
            'Suburbs',
            'State',
            'Job Opening',
            'First Name',
            'Stakeholder Name',
            'Title',
            'Email',
            'History & Follow Ups',
            'History & Follow Ups 2.0',
            'History & Follow Ups 3.0',
            'History & Follow Ups 4.0'
        ];
        outputData.push(newHeaders);

        for (let i = 1; i < jobValues.length; i++) {
            const row = jobValues[i];
            if (!row || row.length === 0) continue;

            const rawJobCompany = row[jCol_Company] != null ? row[jCol_Company].toString() : '';
            const cleanJobComp = this._cleanCompanyNameForMatch(rawJobCompany);

            const stakeholders = cleanJobComp && companyMap.has(cleanJobComp)
                ? companyMap.get(cleanJobComp)
                : null;

            if (stakeholders && stakeholders.length > 0) {
                stakeholders.forEach(sh => {
                    const newRow = [...row];
                    newRow.push(
                        sh.nature ?? '',
                        sh.company ?? '',
                        sh.suburb ?? '',
                        sh.state ?? '',
                        sh.job ?? '',
                        sh.firstName ?? '',
                        sh.fullName ?? '',
                        sh.title ?? '',
                        sh.email ?? '',
                        sh.history1 ?? '',
                        sh.history2 ?? '',
                        sh.history3 ?? '',
                        sh.history4 ?? ''
                    );
                    outputData.push(newRow);
                });
            } else {
                const newRow = [...row];
                // Pad empty stakeholder columns to keep CSV aligned with headers
                newRow.push('', '', '', '', '', '', '', '', '', '', '', '', '');
                outputData.push(newRow);
            }
        }

        return outputData;
    }

    _exportStakeholderEnrichedCsv(matrix) {
        if (!matrix || matrix.length === 0) return;

        const csvLines = matrix.map(row =>
            row.map(cell => {
                const value = cell === null ? '' : this._normalizeText(String(cell));
                return `"${value.replace(/"/g, '""')}"`;
            }).join(',')
        );

        const csvContent = csvLines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = 'seek_job_with_stakeholders.csv';

        const url = URL.createObjectURL(blob);
        const self = this;
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        }, function (downloadId) {
            if (chrome.runtime.lastError) {
                self._updateMultiStatus('Export failed: ' + chrome.runtime.lastError.message, 'error');
            } else {
                self._updateMultiStatus('Download complete', 'success');
            }
            URL.revokeObjectURL(url);
        });
    }

    async _exportJobsWithStakeholders(jobs) {
        try {

            this._updateMultiStatus('Merging stakeholder info from uploaded master...', 'loading');
            const { masterValues } = await chrome.storage.local.get(['masterValues']);

            if (!Array.isArray(masterValues) || masterValues.length < 2) {
                throw new Error('No master file uploaded. Please upload your master Excel first.');
            }

            const jobValues = this._buildJobListingMatrixFromJobs(jobs);
            const mergedMatrix = this._mergeJobsWithStakeholders(masterValues, jobValues);
            this._exportStakeholderEnrichedCsv(mergedMatrix);

        } catch (error) {

            console.error('Stakeholder enrichment failed:', error);
            this._updateMultiStatus('Stakeholder enrichment failed, exported jobs only. ' + error.message, 'error');

            this._exportMultiToExcel(jobs); //even enrichment stakeholder info failed, still able to export original job listing data
        }
    }

    _displayErrorPreview(errors) {
        if (!errors || errors.length === 0) {
            errorPreviewSection.style.display = 'none';
            return;
        }

        errorPreviewSection.style.display = 'block';
        errorCount.textContent = `${errors.length} URL(s) failed`;
        errorToggleText.textContent = 'Show Failed URLs';

        errorList.innerHTML = '';
        errors.forEach((error) => {
            const errorItem = document.createElement('div');
            errorItem.className = 'error-item';

            const urlSpan = document.createElement('span');
            urlSpan.className = 'error-url';
            urlSpan.textContent = error.url;

            const reasonSpan = document.createElement('span');
            reasonSpan.className = 'error-reason';
            reasonSpan.textContent = `Error: ${error.error}`;

            errorItem.appendChild(urlSpan);
            errorItem.appendChild(reasonSpan);
            errorList.appendChild(errorItem);
        });
    }
}

// Instantiation
new SingleSeekURLJobExtractor();
new MultipleSeekURLJobExtractor();




class DataEnricher { };

class CopyURLs { };



document.addEventListener('DOMContentLoaded', function () {




    // ============================================================================
    // DATA ENRICHER TOOL
    // ============================================================================
    const apolloApiKeyInput = document.getElementById('apolloApiKey');
    const findymailApiKeyInput = document.getElementById('findymailApiKey');
    const linkedinUrlsInput = document.getElementById('linkedinUrls');
    const enricherCopyPasteUrlsBtn = document.getElementById('enricherCopyPasteUrlsBtn');
    const enrichBtn = document.getElementById('enrichBtn');
    const enrichmentStatusEl = document.getElementById('enrichment-status');

    // Function to validate LinkedIn person profile URL
    function isValidLinkedInProfileUrl(url) {
        if (!url || !url.startsWith('http')) {
            return false;
        }
        return url.includes('linkedin.com/in/');
    }

    enricherCopyPasteUrlsBtn.addEventListener('click', async function () {
        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });

            if (tabs.length === 0) {
                enrichmentStatusEl.textContent = 'No tabs found in current window';
                enrichmentStatusEl.className = 'status-message error';
                return;
            }

            const linkedInUrls = tabs
                .map(tab => tab.url)
                .filter(url => isValidLinkedInProfileUrl(url));

            if (linkedInUrls.length === 0) {
                enrichmentStatusEl.textContent = 'No LinkedIn profile URLs found in current tabs';
                enrichmentStatusEl.className = 'status-message error';
                return;
            }

            linkedinUrlsInput.value = linkedInUrls.join('\n');
            updateLinkedInUrlCount();
            enrichmentStatusEl.textContent = `Copied ${linkedInUrls.length} LinkedIn profile URL(s)`;
            enrichmentStatusEl.className = 'status-message success';
        } catch (error) {
            enrichmentStatusEl.textContent = 'Error: ' + error.message;
            enrichmentStatusEl.className = 'status-message error';
        }
    });

    // Load saved API keys
    chrome.storage.local.get(['apolloApiKey', 'findymailApiKey'], function (result) {
        if (result.apolloApiKey) {
            apolloApiKeyInput.value = result.apolloApiKey;
        }
        if (result.findymailApiKey) {
            findymailApiKeyInput.value = result.findymailApiKey;
        }
    });

    // Save API keys on input
    apolloApiKeyInput.addEventListener('input', function () {
        chrome.storage.local.set({ apolloApiKey: apolloApiKeyInput.value });
    });

    findymailApiKeyInput.addEventListener('input', function () {
        chrome.storage.local.set({ findymailApiKey: findymailApiKeyInput.value });
    });

    // LinkedIn URL validation and count display
    const linkedinUrlCount = document.createElement('div');
    linkedinUrlCount.className = 'url-count-display';
    linkedinUrlCount.style.fontSize = '12px';
    linkedinUrlCount.style.color = '#666';
    linkedinUrlCount.style.marginTop = '4px';
    linkedinUrlsInput.parentElement.appendChild(linkedinUrlCount);

    function updateLinkedInUrlCount() {
        const text = linkedinUrlsInput.value.trim();
        if (!text) {
            linkedinUrlCount.textContent = '';
            return;
        }

        // Filter only LinkedIn URLs
        const urlList = text.split(/[\n,]/)
            .map(u => u.trim())
            .filter(u => u.length > 0 && u.includes('linkedin.com/in/'));

        // Auto-filter: keep only LinkedIn URLs in textarea
        if (urlList.length > 0) {
            const filteredText = urlList.join('\n');
            linkedinUrlsInput.value = filteredText;
            chrome.storage.local.set({ linkedinUrls: filteredText });

        }
    }

    linkedinUrlsInput.addEventListener('input', function () {
        chrome.storage.local.set({ linkedinUrls: linkedinUrlsInput.value });
        updateLinkedInUrlCount();
    });


    enrichBtn.addEventListener('click', async function () {

        //Checking existence of apollo api, findymail api and linkedin URLs

        const apolloKey = apolloApiKeyInput.value.trim();
        const findymailKey = findymailApiKeyInput.value.trim();
        const urls = linkedinUrlsInput.value.trim();

        if (!apolloKey) {
            enrichmentStatusEl.textContent = 'Please enter Apollo API Key';
            enrichmentStatusEl.className = 'status-message error';
            return;
        }

        if (!findymailKey) {
            enrichmentStatusEl.textContent = 'Please enter Findymail API Key';
            enrichmentStatusEl.className = 'status-message error';
        }

        if (!urls) {
            enrichmentStatusEl.textContent = 'Please enter LinkedIn URLs';
            enrichmentStatusEl.className = 'status-message error';
            return;
        }

        enrichBtn.disabled = true;
        enrichmentStatusEl.textContent = 'Starting enrichment...';
        enrichmentStatusEl.className = 'status-message loading';

        try {
            await processLinkedInUrls(urls, apolloKey, findymailKey);
        } catch (error) {
            enrichmentStatusEl.textContent = 'Error: ' + error.message;
            enrichmentStatusEl.className = 'status-message error';
        } finally {
            enrichBtn.disabled = false;
        }
    });

    // ============================================================================
    // COPY URLs TOOL
    // ============================================================================
    const urlsTextarea = document.getElementById('urlsTextarea');
    const copyUrlsBtn = document.getElementById('copyUrlsBtn');
    const pasteUrlsBtn = document.getElementById('pasteUrlsBtn');
    const copyStatusEl = document.getElementById('copyStatus');

    copyUrlsBtn.addEventListener('click', async function () {
        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            if (tabs.length === 0) {
                copyStatusEl.textContent = 'No tabs found in current window';
                copyStatusEl.className = 'status-message error';
                return;
            }
            const urls = tabs.map(tab => tab.url).filter(url => url && url.startsWith('http'));
            if (urls.length === 0) {
                copyStatusEl.textContent = 'No valid URLs in current tabs';
                copyStatusEl.className = 'status-message error';
                return;
            }
            const urlsText = urls.join('\n');
            urlsTextarea.value = urlsText;
            await navigator.clipboard.writeText(urlsText);
            copyStatusEl.textContent = `Copied ${urls.length} URL(s) to clipboard`;
            copyStatusEl.className = 'status-message success';
        } catch (error) {
            copyStatusEl.textContent = 'Error: ' + error.message;
            copyStatusEl.className = 'status-message error';
        }
    });

    pasteUrlsBtn.addEventListener('click', async function () {
        const text = urlsTextarea.value.trim();
        if (!text) {
            copyStatusEl.textContent = 'No URLs in text box. Copy URLs first or paste some.';
            copyStatusEl.className = 'status-message error';
            return;
        }
        const urls = text.split(/\r?\n/).map(u => u.trim()).filter(u => u.length > 0 && u.startsWith('http'));
        if (urls.length === 0) {
            copyStatusEl.textContent = 'No valid URLs to open';
            copyStatusEl.className = 'status-message error';
            return;
        }
        try {
            for (const url of urls) {
                await chrome.tabs.create({ url: url });
            }
            copyStatusEl.textContent = `Opened ${urls.length} URL(s) in new tabs`;
            copyStatusEl.className = 'status-message success';
        } catch (error) {
            copyStatusEl.textContent = 'Error opening URLs: ' + error.message;
            copyStatusEl.className = 'status-message error';
        }
    });
});
