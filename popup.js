import { AZURE_CONFIGURATION } from "./config";

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

   
    // COPY URLs TOOL
    const urlsTextarea = document.getElementById('urlsTextarea');
    const copyUrlsBtn = document.getElementById('copyUrlsBtn');
    const pasteUrlsBtn = document.getElementById('pasteUrlsBtn');
    const copyStatus = document.getElementById('copyStatus');

    copyUrlsBtn.addEventListener('click', async function () {
        try {
            // Get all tabs in the current window
            const tabs = await chrome.tabs.query({ currentWindow: true });

            if (tabs.length === 0) {
                copyStatus.textContent = 'No tabs found in current window';
                copyStatus.className = 'status-message error';
                return;
            }

            // Extract URLs from all tabs
            const urls = tabs
                .map(tab => tab.url)
                .filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));

            if (urls.length === 0) {
                copyStatus.textContent = 'No valid URLs found in tabs';
                copyStatus.className = 'status-message error';
                return;
            }

            urlsTextarea.value = urls.join('\n');
            copyStatus.textContent = `Copied ${urls.length} URLs`;
            copyStatus.className = 'status-message success';

            // // Save to storage
            // await chrome.storage.local.set({ copiedUrls: urlsTextarea.value });
        } catch (error) {
            copyStatus.textContent = 'Error: ' + error.message;
            copyStatus.className = 'status-message error';
        }
    });

    pasteUrlsBtn.addEventListener('click', async function () {
        const urls = urlsTextarea.value.trim();
        if (!urls) {
            copyStatus.textContent = 'No URLs to paste';
            copyStatus.className = 'status-message error';
            return;
        }

        try {
            const urlList = urls.split('\n')
                .map(u => u.trim())
                .filter(u => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://')));

            if (urlList.length === 0) {
                copyStatus.textContent = 'No valid URLs to open';
                copyStatus.className = 'status-message error';
                return;
            }

            // Create a new window with all URLs
            // First, create the window with the first URL
            const newWindow = await chrome.windows.create({
                url: urlList[0],
                focused: true
            });

            // Then add remaining URLs as tabs in the new window
            for (let i = 1; i < urlList.length; i++) {
                await chrome.tabs.create({
                    windowId: newWindow.id,
                    url: urlList[i],
                    active: false
                });
                // Small delay to avoid overwhelming the browser
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            copyStatus.textContent = `Opened ${urlList.length} URLs in new window`;
            copyStatus.className = 'status-message success';
        } catch (error) {
            copyStatus.textContent = 'Error: ' + error.message;
            copyStatus.className = 'status-message error';
        }
    });

    // // Load saved URLs
    // chrome.storage.local.get(['copiedUrls'], function (result) {
    //     if (result.copiedUrls) {
    //         urlsTextarea.value = result.copiedUrls;
    //     }
    // });

    // ============================================================================
    // JOB DATA EXTRACTOR TOOL
    // ============================================================================
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

    // chrome.storage.local.get(['savedUrl', 'savedMultiUrls'], function (result) {
    //     if (result.savedUrl) {
    //         jobUrlInput.value = result.savedUrl;
    //     }
    //     if (result.savedMultiUrls) {
    //         multiUrlsInput.value = result.savedMultiUrls;
    //     }
    // });

    // jobUrlInput.addEventListener('input', function () {
    //     chrome.storage.local.set({ savedUrl: jobUrlInput.value });
    // });

    // multiUrlsInput.addEventListener('input', function () {
    //     chrome.storage.local.set({ savedMultiUrls: multiUrlsInput.value });
    // });

    extractBtn.addEventListener('click', async function () {
        const url = jobUrlInput.value.trim();

        if (!url) {
            updateStatus('Please enter a job search URL', 'error');
            return;
        }

        if (!url.includes('seek.com')) {
            updateStatus('Please enter a valid Seek URL', 'error');
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
            updateStatus('Starting job extraction...', 'loading');
            updateProgress(0);

            chrome.tabs.sendMessage(tab.id, { action: 'startScraping' });

        } catch (error) {
            updateStatus('Error: ' + error.message, 'error');
            extractBtn.disabled = false;
        }
    });

    // Function to validate Seek job URL
    function isValidSeekJobUrl(url) {
        if (!url || url === 'N/A' || !url.startsWith('http')) {
            return false;
        }
        // Check if it's a Seek URL with job listing pattern
        if (!url.includes('seek.com') || (!url.includes('/job/') && !url.includes('/jobs/') && !url.includes('jobId'))) {
            return false;
        }
        return true;
    }

    copyPasteUrlsBtn.addEventListener('click', async function () {
        try {
            // Get all tabs in the current window
            const tabs = await chrome.tabs.query({ currentWindow: true });

            if (tabs.length === 0) {
                updateMultiStatus('No tabs found in current window', 'error');
                return;
            }

            // Extract URLs from all tabs and filter only Seek job URLs
            const seekJobUrls = tabs
                .map(tab => tab.url)
                .filter(url => isValidSeekJobUrl(url));

            if (seekJobUrls.length === 0) {
                updateMultiStatus('No Seek job URLs found in current tabs', 'error');
                return;
            }

            // Paste filtered URLs into the textarea
            multiUrlsInput.value = seekJobUrls.join('\n');
            updateMultiStatus(`Copied ${seekJobUrls.length} Seek job URL(s)`, 'success');
        } catch (error) {
            updateMultiStatus('Error: ' + error.message, 'error');
        }
    });

    multiExtractBtn.addEventListener('click', async function () {
        const urlsText = multiUrlsInput.value.trim();

        if (!urlsText) {
            updateMultiStatus('Please enter at least one job URL', 'error');
            return;
        }

        const urls = urlsText.split('\n')
            .map(url => url.trim())
            .filter(url => url.length > 0);

        if (urls.length === 0) {
            updateMultiStatus('Please enter valid URLs', 'error');
            return;
        }

        const invalidUrls = urls.filter(url => !url.includes('seek.com.au/job'));
        if (invalidUrls.length > 0) {
            updateMultiStatus(`Found ${invalidUrls.length} invalid URL. Please use Seek job listing URLs.`, 'error');
            return;
        }

        multiExtractBtn.disabled = true;
        updateMultiStatus(`Extracting ${urls.length} job(s)...`, 'loading');
        updateMultiProgress(0);
        updateMultiDetails('Initializing...');

        extractionErrors = [];
        errorPreviewSection.style.display = 'none';
        errorPreviewContent.style.display = 'none';
        errorToggleIcon.classList.remove('expanded');

        chrome.runtime.sendMessage({
            action: 'startMultiExtraction',
            urls: urls
        });
    });

    exportBtn.addEventListener('click', function () {
        if (extractedJobs.length === 0) {
            updateStatus('No jobs to export', 'error');
            return;
        }

        exportToExcel(extractedJobs, 'job_search_extraction');
    });

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

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'scrapingProgress') {
            updateStatus(`Extracting page ${request.page} (${request.jobCount} jobs found)`, 'loading');
            const estimatedProgress = Math.min((request.page / 10) * 100, 90);
            updateProgress(estimatedProgress);
        } else if (request.action === 'scrapingComplete') {
            extractedJobs = request.jobs;
            updateStatus(`Extraction completed! Found ${request.jobs.length} jobs across ${request.totalPages} pages`, 'success');
            updateProgress(100);
            exportBtn.disabled = false;
            extractBtn.disabled = false;
        } else if (request.action === 'scrapingError') {
            updateStatus('Error: ' + request.error, 'error');
            extractBtn.disabled = false;
            updateProgress(0);
        } else if (request.action === 'multiExtractionProgress') {
            const { current, total, results, errors } = request.progress;
            const percentage = (current / total) * 100;
            updateMultiProgress(percentage);
            updateMultiStatus(`Processing ${current} of ${total} URLs...`, 'loading');
            updateMultiDetails(`Extracted: ${results}`);
        } else if (request.action === 'multiExtractionComplete') {
            multiExtractedJobs = request.results;
            extractionErrors = request.errors;
            const totalUrls = request.results.length + request.errors.length;
            updateMultiStatus(`Complete! Extracted ${request.results.length} of ${totalUrls} jobs`, 'success');
            updateMultiProgress(100);
            updateMultiDetails(`Extracted: ${request.results.length} | Errors: ${request.errors.length}`);
            multiExtractBtn.disabled = false;

            if (request.results.length > 0 && !isExporting) {
                isExporting = true;
                setTimeout(async () => {
                    await exportJobsWithStakeholders(request.results);
                    isExporting = false;
                }, 500);
            }

            if (request.errors.length > 0) {
                console.warn('Extraction errors:', request.errors);
                displayErrorPreview(request.errors);
            }
        }
    });

    function updateStatus(message, type = '') {
        statusDiv.textContent = message;
        statusDiv.className = 'status-message ' + type;
    }

    function updateProgress(percentage) {
        progressFill.style.width = percentage + '%';
    }

    function updateMultiStatus(message, type = '') {
        multiStatusDiv.textContent = message;
        multiStatusDiv.className = 'status-message ' + type;
    }

    function updateMultiProgress(percentage) {
        multiProgressFill.style.width = percentage + '%';
    }

    function updateMultiDetails(message) {
        multiDetailsDiv.textContent = message;
    }

    function normalizeText(str) {
        if (!str) return str;
        return str
            .replace(/â€"/g, "-")
            .replace(/â€"/g, "-")
            .replace(/Â/g, "")
            .replace(/–/g, "-")
            .replace(/—/g, "-");
    }

    function exportToExcel(jobs, filename) {
        if (jobs.length === 0) return;

        const headers = ['Job Title', 'Company', 'Location', 'Salary', 'Job URL'];
        const csvContent = [
            headers.join(','),
            ...jobs.map(job => [
                `"${normalizeText(job.jobTitle).replace(/"/g, '""')}"`,
                `"${normalizeText(job.company).replace(/"/g, '""')}"`,
                `"${normalizeText(job.location).replace(/"/g, '""')}"`,
                `"${normalizeText(job.salary).replace(/"/g, '""')}"`,
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
                updateStatus('Export failed: ' + chrome.runtime.lastError.message, 'error');
            } else {
                updateStatus('Successfully exported', 'success');
            }
            URL.revokeObjectURL(url);
        });
    }

    function exportMultiToExcel(jobs) {
        if (jobs.length === 0) return;

        const headers = ['State', 'Suburbs', 'Job Title', 'Company Name', 'Salary', 'Posted Date', 'Contact Email', 'URL'];
        const csvContent = [
            headers.join(','),
            ...jobs.map(job => [
                `"${normalizeText(job.state || '').replace(/"/g, '""')}"`,
                `"${normalizeText(job.suburbs || '').replace(/"/g, '""')}"`,
                `"${normalizeText(job.jobTitle || '').replace(/"/g, '""')}"`,
                `"${normalizeText(job.company || '').replace(/"/g, '""')}"`,
                `"${normalizeText(job.salary || '-').replace(/"/g, '""')}"`,
                `"${normalizeText(job.postedDate || '').replace(/"/g, '""')}"`,
                `"${normalizeText(job.contactEmail || '').replace(/"/g, '""')}"`,
                `"${job.url || ''}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = `seek_job_data.csv`;

        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        }, function (downloadId) {
            if (chrome.runtime.lastError) {
                updateMultiStatus('Export failed: ' + chrome.runtime.lastError.message, 'error');
            } else {
                updateMultiStatus(`Downloaded ${jobs.length} jobs`, 'success');
            }
            URL.revokeObjectURL(url);
        });
    }

    // AZURE + MICROSOFT GRAPH INTEGRATION FOR MASTER SHEET

    function buildAzureAuthUrl() {
        const params = new URLSearchParams({
            client_id: AZURE_CONFIGURATION.clientId,
            response_type: 'token',
            redirect_uri: chrome.identity.getRedirectURL(),
            scope: AZURE_CONFIGURATION.scopes.join(' '),
            response_mode: 'fragment'
        });
        return `https://login.microsoftonline.com/${AZURE_CONFIGURATION.tenant}/oauth2/v2.0/authorize?${params.toString()}`;
    }

    function getAzureAccessToken() {
        const authUrl = buildAzureAuthUrl();
        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow(
                {
                    url: authUrl,
                    interactive: true
                },
                (redirectUrl) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (!redirectUrl) {
                        reject(new Error('Empty redirect URL from Azure'));
                        return;
                    }

                    const token = redirectUrl.split('#')[1] || ''; //EXTRACT the token (ID token/access token)
                    const params = new URLSearchParams(token);
                    const accessToken = params.get('access_token');
                    const IdToken = params.get('id_token');
                    //const refreshToken = params.get('refresh_token'); only return 

                    if (!accessToken) {
                        reject(new Error('No access token returned from Azure'));
                        return;
                    }

                    if(! IdToken ){
                        reject(new Error('No ID Token returned from Azure'));
                    }

                    resolve(accessToken);
                }
            );
        });
    }

    async function callGraph(path, method = 'GET', body = null, accessToken) {
        const response = await fetch(`https://graph.microsoft.com/v1.0/${path}`, {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Graph error ${response.status}: ${text}`);
        }

        return response.json();
    }

    function buildShareIdFromUrl(url) {
        // Strip any query string (e.g. ?e=h5LyRf) so we use the stable part of the link
        const cleanUrl = url.split('?')[0];
        // Graph expects URL-safe base64 without padding, prefixed with "u!"
        const base64 = btoa(cleanUrl).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        return `u!${base64}`;
    }

    async function getMasterValuesFromOneDrive(accessToken) {
        const shareId = encodeURIComponent(buildShareIdFromUrl(AZURE_CONFIG.masterShareLink));
        const driveItem = await callGraph(`shares/${shareId}/driveItem`, 'GET', null, accessToken);

        const driveId = driveItem.parentReference && driveItem.parentReference.driveId;
        const itemId = driveItem.id;

        if (!driveId || !itemId) {
            throw new Error('Could not resolve drive item for master workbook');
        }

        const usedRange = await callGraph(
            `drives/${driveId}/items/${itemId}/workbook/worksheets('Master')/usedRange(valuesOnly=true)`,
            'GET',
            null,
            accessToken
        );

        return usedRange.values || [];
    }

    function cleanCompanyNameForMatch(name) {
        if (!name) return '';
        let s = name.toUpperCase();
        s = s.replace(/[^A-Z0-9\s]/g, '');

        const noiseRegex = /\b(PTY|LTD|LIMITED|INC|CORPORATION|GROUP|AUSTRALIA|HOLDINGS|SOLUTIONS|SYSTEMS|SERVICES|DEVELOPMENTS)\b/g;

        s = s.replace(noiseRegex, '');
        return s.replace(/\s+/g, ' ').trim();
    }

    function buildStakeholderMapFromMaster(masterValues) {
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
            const rawCompany = row[mCol_Company];
            const rawNature = row[mCol_Nature];

            if (rawCompany && rawCompany.toString().trim() !== '') {
                lastCompany = rawCompany.toString();
            }

            if (rawNature && rawNature.toString().trim() !== '') {
                lastNature = rawNature.toString();
            }

            if (lastCompany) {
                const cleanComp = cleanCompanyNameForMatch(lastCompany);

                const stakeholder = {
                    nature: row[mCol_Nature] ? row[mCol_Nature].toString() : '',
                    company: row[mCol_Company] ? row[mCol_Company].toString() : '',
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
        }

        return companyMap;
    }

    function buildJobListingMatrixFromJobs(jobs) {
        const headers = ['State', 'Suburbs', 'Job Title', 'Company Name', 'Salary', 'Posted Date', 'Contact Email', 'URL'];

        const rows = jobs.map(job => [
            job.state || '',
            job.suburbs || '',
            job.jobTitle || '',
            job.company || '',
            job.salary || '-',
            job.postedDate || '',
            job.contactEmail || '',
            job.url || ''
        ]);

        return [headers, ...rows];
    }

    function mergeJobsWithStakeholders(masterValues, jobValues) {
        const companyMap = buildStakeholderMapFromMaster(masterValues);
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
            const cleanJobComp = cleanCompanyNameForMatch(rawJobCompany);

            const stakeholders = cleanJobComp && companyMap.has(cleanJobComp)
                ? companyMap.get(cleanJobComp)
                : null;

            if (stakeholders && stakeholders.length > 0) {
                stakeholders.forEach(sh => {
                    const newRow = [...row];
                    newRow.push(
                        sh.nature,
                        sh.company,
                        sh.suburb,
                        sh.state,
                        sh.job,
                        sh.firstName,
                        sh.fullName,
                        sh.title,
                        sh.email,
                        sh.history1,
                        sh.history2,
                        sh.history3,
                        sh.history4
                    );
                    outputData.push(newRow);
                });
            } else {
                const newRow = [...row];
                newRow.push('', '', '', '', '', '', '', '', '', '', '', '', '');
                outputData.push(newRow);
            }
        }

        return outputData;
    }

    function exportStakeholderEnrichedCsv(matrix) {
        if (!matrix || matrix.length === 0) return;

        const csvLines = matrix.map(row =>
            row.map(cell => {
                const value = cell == null ? '' : normalizeText(String(cell));
                return `"${value.replace(/"/g, '""')}"`;
            }).join(',')
        );

        const csvContent = csvLines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = 'seek_job_data_with_stakeholders.csv';

        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        }, function () {
            if (chrome.runtime.lastError) {
                updateMultiStatus('Export failed: ' + chrome.runtime.lastError.message, 'error');
            } else {
                // minus header row
                updateMultiStatus(`Downloaded ${matrix.length - 1} rows with stakeholders`, 'success');
            }
            URL.revokeObjectURL(url);
        });
    }

    async function exportJobsWithStakeholders(jobs) {
        try {
            updateMultiStatus('Loading master data from OneDrive...', 'loading');
            const accessToken = await getAzureAccessToken();
            const masterValues = await getMasterValuesFromOneDrive(accessToken);

            if (!masterValues || masterValues.length === 0) {
                throw new Error('Master sheet is empty or not accessible');
            }

            const jobValues = buildJobListingMatrixFromJobs(jobs);
            const mergedMatrix = mergeJobsWithStakeholders(masterValues, jobValues);
            exportStakeholderEnrichedCsv(mergedMatrix);
        } catch (error) {
            console.error('Stakeholder enrichment failed:', error);
            updateMultiStatus('Stakeholder enrichment failed, exported jobs only. ' + error.message, 'error');
            exportMultiToExcel(jobs);
        }
    }

    function displayErrorPreview(errors) {
        if (!errors || errors.length === 0) {
            errorPreviewSection.style.display = 'none';
            return;
        }

        errorPreviewSection.style.display = 'block';
        errorCount.textContent = `${errors.length} URL${errors.length > 1 ? 's' : ''} failed`;
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

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentUrl = tabs[0].url;
        if (currentUrl && (currentUrl.includes('seek.com'))) {
            jobUrlInput.value = currentUrl;
            chrome.storage.local.set({ savedUrl: currentUrl });
        }
    });

    // ============================================================================
    // DATA ENRICHER TOOL
    // ============================================================================
    const apolloApiKeyInput = document.getElementById('apolloApiKey');
    const findymailApiKeyInput = document.getElementById('findymailApiKey');
    const linkedinUrlsInput = document.getElementById('linkedinUrls');
    const enrichBtn = document.getElementById('enrichBtn');

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
            if (filteredText !== text) {
                linkedinUrlsInput.value = filteredText;
                chrome.storage.local.set({ linkedinUrls: filteredText });
            }
        }

        linkedinUrlCount.textContent = `${urlList.length} LinkedIn URL${urlList.length !== 1 ? 's' : ''} detected`;
        linkedinUrlCount.style.color = urlList.length > 0 ? '#28a745' : '#dc3545';
    }

    linkedinUrlsInput.addEventListener('input', function () {
        chrome.storage.local.set({ linkedinUrls: linkedinUrlsInput.value });
        updateLinkedInUrlCount();
    });

    // Initial count on load
    // chrome.storage.local.get(['linkedinUrls'], function (result) {
    //     if (result.linkedinUrls) {
    //         linkedinUrlsInput.value = result.linkedinUrls;
    //         updateLinkedInUrlCount();
    //     }
    // });

    enrichBtn.addEventListener('click', async function () {
        const apolloKey = apolloApiKeyInput.value.trim();
        const findymailKey = findymailApiKeyInput.value.trim();
        const urls = linkedinUrlsInput.value.trim();

        if (!apolloKey) {
            document.getElementById('enrichment-status').textContent = 'Please enter Apollo API Key';
            document.getElementById('enrichment-status').className = 'status-message error';
            return;
        }

        if (!urls) {
            document.getElementById('enrichment-status').textContent = 'Please enter LinkedIn URLs';
            document.getElementById('enrichment-status').className = 'status-message error';
            return;
        }

        enrichBtn.disabled = true;
        document.getElementById('enrichment-status').textContent = 'Starting enrichment...';
        document.getElementById('enrichment-status').className = 'status-message loading';

        try {
            await processLinkedInUrls(urls, apolloKey, findymailKey);
        } catch (error) {
            document.getElementById('enrichment-status').textContent = 'Error: ' + error.message;
            document.getElementById('enrichment-status').className = 'status-message error';
        } finally {
            enrichBtn.disabled = false;
        }
    });
});
