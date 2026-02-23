
async function processLinkedInUrls(urls, apolloKey, findymailKey) {

    const statusEl = document.getElementById('enrichment-status');
    const progressEl = document.getElementById('enrichment-progress');

    // Function to validate LinkedIn person profile URL
    function isValidLinkedInProfileUrl(url) {
        if (!url || url === 'N/A' || !url.startsWith('http')) {
            return false;
        }
        return url.includes('linkedin.com/in/');
    }

    // Clean URLs - only allow LinkedIn person profile URLs
    const urlList = urls.split(/[\n,]/)
        .map(u => u.trim())
        .filter(u => isValidLinkedInProfileUrl(u))
        .map(u => {
            // Normalize URLs - ensure they have https://
            if (!u.startsWith('http://') && !u.startsWith('https://')) {
                return 'https://' + u;
            }
            return u;
        });

    if (urlList.length === 0) {
        statusEl.textContent = 'No valid LinkedIn URLs found. Please enter URLs in format: https://www.linkedin.com/in/username';
        return;
    }

    // Initialize progress
    progressEl.max = urlList.length;
    progressEl.value = 0;

    // Load current stats to update them
    const { enrichmentStats } = await chrome.storage.local.get('enrichmentStats');
    const stats = enrichmentStats || {
        processed: 0,
        enriched: 0,
        apolloCount: 0,
        findymailCount: 0
    };

    // Reset stats for this session
    const sessionStats = {
        processed: 0,
        enriched: 0,
        apolloCount: 0,
        findymailCount: 0
    };

    // Initialize enriched data map
    const enrichedDataMap = new Map();
    urlList.forEach(url => {
        enrichedDataMap.set(url, {
            linkedin_url: url,
            first_name: '',
            last_name: '',
            email: '',
            state: '',
            current_role: '',
            current_company: '',
            company_key_words: ''
        });
    });

    // ============================================
    // PHASE 1: Bulk Apollo Processing (5 per batch)
    // ============================================
    statusEl.textContent = `Phase 1: Processing ${urlList.length} URLs with Apollo...`;

    try {
        const apolloResults = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'fetchApolloDataBulk',
                data: { linkedinUrls: urlList, apiKey: apolloKey }
            }, response => {
                if (response.error) reject(new Error(response.error));
                else resolve(response.data);
            });
        });

        // Process Apollo results
        const urlsNeedingFindymail = [];

        apolloResults.forEach((result, index) => {
            const url = result.url;
            const personData = enrichedDataMap.get(url);

            if (result.success && result.data && result.data.person) {
                const p = result.data.person;
                personData.first_name = p.first_name || '';
                personData.last_name = p.last_name || '';
                personData.email = p.email || '';
                personData.state = p.state || '';
                personData.current_role = p.title || '';
                personData.current_company = p.organization?.name || '';
                personData.company_key_words = p.organization?.industry || '';

                if (personData.email && personData.email.trim().length > 0) {
                    sessionStats.apolloCount++;
                } else {
                    // No email found, add to Findymail queue
                    urlsNeedingFindymail.push(url);
                }
            } else {
                // Apollo failed or no data, add to Findymail queue
                urlsNeedingFindymail.push(url);
            }

            // Update progress
            const processed = index + 1;
            progressEl.value = processed;
            statusEl.textContent = `Phase 1: Processed ${processed}/${urlList.length} URLs (Apollo: ${sessionStats.apolloCount} emails found)`;
        });

        // ============================================
        // PHASE 2: Bulk Findymail Processing (for missing emails - batches of 5)
        // ============================================
        if (urlsNeedingFindymail.length > 0 && findymailKey) {
            statusEl.textContent = `Phase 2: Enriching ${urlsNeedingFindymail.length} URLs with Findymail...`;

            try {
                const findymailResults = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'fetchFindymailDataBulk',
                        data: { linkedinUrls: urlsNeedingFindymail, apiKey: findymailKey }
                    }, response => {
                        if (response.error) reject(new Error(response.error));
                        else resolve(response.data);
                    });
                });

                // Process Findymail results
                findymailResults.forEach((result, index) => {
                    const url = result.url;
                    const personData = enrichedDataMap.get(url);

                    if (result.success && result.data) {
                        // Findymail returns: { email, name, domain, first_name, last_name }
                        const findymailData = result.data;

                        if (findymailData && findymailData.email && findymailData.email.trim().length > 0) {
                            // CRITICAL: Actually write the email to personData
                            personData.email = findymailData.email.trim();
                            sessionStats.findymailCount++;

                            // Fallback fill for name if Apollo completely failed
                            if (!personData.first_name && findymailData.first_name) {
                                personData.first_name = findymailData.first_name;
                            }
                            if (!personData.last_name && findymailData.last_name) {
                                personData.last_name = findymailData.last_name;
                            }

                            if (!personData.current_company && findymailData.domain) {
                                personData.current_company = findymailData.domain;
                            }

                            // Also try to extract from name field if first_name/last_name not available
                            if (!personData.first_name && findymailData.name) {
                                const nameParts = findymailData.name.trim().split(' ');
                                if (nameParts.length > 0) {
                                    personData.first_name = nameParts[0];
                                    if (nameParts.length > 1) {
                                        personData.last_name = nameParts.slice(1).join(' ');
                                    }
                                }
                            }

                            // Debug log to verify email is being set
                            console.log(`[Findymail] URL: ${url}, Email found: ${personData.email}`);
                        } else {
                            console.log(`[Findymail] URL: ${url}, No email in response:`, findymailData);
                        }
                    } else {
                        console.log(`[Findymail] URL: ${url}, Request failed:`, result.error || 'Unknown error');
                    }

                    // Update progress during Findymail phase
                    const totalProcessed = urlList.length - urlsNeedingFindymail.length + index + 1;
                    progressEl.value = totalProcessed;
                    statusEl.textContent = `Phase 2: Enriching ${index + 1}/${urlsNeedingFindymail.length} URLs (Findymail: ${sessionStats.findymailCount} emails found)`;
                });
            } catch (e) {
                console.warn('Findymail bulk processing error:', e);
            }
        }

    } catch (e) {
        console.error('Apollo bulk processing error:', e);
        statusEl.textContent = `Error: ${e.message}`;
        statusEl.className = 'status-message error';
        return;
    }

    // ============================================
    // FINALIZE: Calculate stats and prepare export
    // ============================================
    const enrichedData = Array.from(enrichedDataMap.values());

    // Debug: Log all data before export to verify emails are present
    console.log('=== FINAL ENRICHED DATA BEFORE EXPORT ===');
    enrichedData.forEach((personData, index) => {
        console.log(`[${index + 1}] URL: ${personData.linkedin_url}`);
        console.log(`  - Email: ${personData.email || '(empty)'}`);
        console.log(`  - Name: ${personData.first_name} ${personData.last_name}`);
        console.log(`  - Company: ${personData.current_company}`);
    });
    console.log('=== END OF ENRICHED DATA ===');

    // Calculate final stats
    enrichedData.forEach(personData => {
        if (personData.first_name || personData.email) {
            sessionStats.enriched++;
        }
    });

    sessionStats.processed = urlList.length;
    progressEl.value = urlList.length;

    // Update cumulative stats
    stats.processed += sessionStats.processed;
    stats.enriched += sessionStats.enriched;
    stats.apolloCount += sessionStats.apolloCount;
    stats.findymailCount += sessionStats.findymailCount;


    // Save updated stats
    await chrome.storage.local.set({ enrichmentStats: stats });

    // Display session stats
    const statsText = `Enriched: ${sessionStats.enriched} | Apollo: ${sessionStats.apolloCount} | Findymail: ${sessionStats.findymailCount}`;
    statusEl.textContent = `Done!`;
    statusEl.className = 'status-message success';

    // Update stats display
    const statsDisplay = document.getElementById('enrichment-stats');
    if (statsDisplay) {
        statsDisplay.textContent = statsText;
    }

    // CRITICAL: Export to Excel AFTER all async operations complete
    // The enrichedData array is already populated with all data including Findymail emails
    console.log(`Exporting ${enrichedData.length} records to Excel...`);
    exportToExcel(enrichedData);
}

function exportToExcel(data) {
    console.log('=== EXPORT TO EXCEL ===');
    console.log(`Total records to export: ${data.length}`);

    // // Verify data before export
    // const recordsWithEmail = data.filter(row => row.email && row.email.trim().length > 0);
    // console.log(`Records with email: ${recordsWithEmail.length}`);
    // recordsWithEmail.forEach((row, index) => {
    //     console.log(`  [${index + 1}] ${row.linkedin_url} -> ${row.email}`);
    // });

    // Convert to CSV first (Excel can open CSV files)
    const headers = ['LinkedIn URL', 'First Name', 'Last Name', 'Email', 'State', 'Current Role', 'Current Company', 'Company Key Words'];

    // CRITICAL: Map each row explicitly to ensure all data is included
    const csvRows = data.map((row, index) => {
        const csvRow = [
            row.linkedin_url || '',
            row.first_name || '',
            row.last_name || '',
            row.email || '',
            row.state || '',
            row.current_role || '',
            row.current_company || '',
            row.company_key_words || ''
        ];


        return csvRow.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');

    console.log('CSV Content preview (first 500 chars):', csvContent.substring(0, 500));

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Use Chrome downloads API for better file handling
    chrome.downloads.download({
        url: url,
        filename: `enriched_data_${new Date().toISOString().slice(0, 10)}.csv`,
        saveAs: false
    }, function (downloadId) {
        if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError);
            // Fallback to direct download
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `enriched_data_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
        } else {
            console.log('Excel file downloaded successfully!');
            URL.revokeObjectURL(url);
        }
    });
}

