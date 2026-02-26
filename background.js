`use strict`

function promisify(fn, ...args) {
    return new Promise((resolve, reject) => {
        fn(...args, (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result);
            }
        });
    });
}

const tabs = {
    create: (options) => promisify(chrome.tabs.create, options),
    get: (id) => promisify(chrome.tabs.get, id),
    remove: (id) => promisify(chrome.tabs.remove, id)
};

const scripting = {
    execute: (details) => chrome.scripting.executeScript(details) // already Promise-based
};

// ============================================================================

let extractionState = {
    isRunning: false,
    urls: [],
    currentIndex: 0,
    results: [],
    errors: []
};

function safeSendMessage(message) {
    chrome.runtime.sendMessage(message).catch(() => { });
}

// ============================================================================
// Markdown + GitHub Gist helpers (OOP-style)
// ============================================================================

class MarkdownJobFormatter {
    buildMarkdown(job) {
        const lines = [];
        const title = job.jobTitle || 'Job Listing';

        lines.push(`# ${title}`);
        lines.push('');

        const summaryLines = [];
        if (job.company) summaryLines.push(`- Company: ${job.company}`);
        if (job.state) summaryLines.push(`- State: ${job.state}`);
        if (job.suburbs) summaryLines.push(`- Suburbs: ${job.suburbs}`);
        if (job.salary) summaryLines.push(`- Salary: ${job.salary}`);
        if (job.postedDate) summaryLines.push(`- Posted: ${job.postedDate}`);

        const contactEmail = job.email || job.contactEmail; 
        if(contactEmail) summaryLines.push(`- Email: ${contactEmail}`);
        
        const originalUrl = job.seekUrl || job.url;
        if (originalUrl) summaryLines.push(`- Original URL: ${originalUrl}`);

        

        if (summaryLines.length > 0) {
            lines.push('');
            lines.push(...summaryLines);
            lines.push('');
        }

        lines.push('---');
        lines.push('');

        const bodyMarkdown = this.htmlToMarkdown(job.descriptionHtml || job.jobHtml || '');
        if (bodyMarkdown) {
            lines.push(bodyMarkdown);
        }

        return lines.join('\n');
    }

    htmlToMarkdown(html) {
        if (!html) return '';

        let md = html;

        // Line breaks and paragraphs
        md = md.replace(/<\s*br\s*\/?>/gi, '\n');
        md = md.replace(/<\/\s*p\s*>/gi, '\n\n');
        md = md.replace(/<\s*p[^>]*>/gi, '');

        // Headings
        md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
        md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
        md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
        md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

        // Bold / italic
        md = md.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**');
        md = md.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*');

        // Lists
        md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
        md = md.replace(/<\/ul>/gi, '\n');
        md = md.replace(/<ul[^>]*>/gi, '\n');

        // Links
        md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        // Strip remaining tags
        md = md.replace(/<\/?[^>]+>/g, '');

        // Basic entities
        const entities = {
            '&nbsp;': ' ',
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': '\''
        };
        Object.keys(entities).forEach(key => {
            md = md.split(key).join(entities[key]);
        });

        return md.replace(/\s+\n/g, '\n').trim();
    }
}

class GistClient {
    constructor(token) {
        this.token = token;
        this.apiBase = 'https://api.github.com';
    }

    async createJobGist(markdown, job) {
        const safeTitle = (job.jobTitle || "Job Info")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || "Job Info";

        const filename = `${safeTitle}.md`;
        const body = {
            public: false,
            files: {}
        };
        body.files[filename] = { content: markdown || '' };

        const response = await fetch(`${this.apiBase}/gists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `token ${this.token}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`GitHub Gist error ${response.status}: ${text}`);
        }

        const data = await response.json();
        return data.html_url;
    }
}

async function getGithubGistToken() {
    try {
        const result = await chrome.storage.local.get(['githubGistToken']);
        return result.githubGistToken || null;
    } catch {
        return null;
    }
}

class JobGistService {
    constructor(formatter) {
        this.formatter = formatter;
    }

    async attachGistUrl(job) {
        const token = await getGithubGistToken();
        if (!token) {
            // No token configured, keep original Seek URL
            return job;
        }

        const client = new GistClient(token);
        const markdown = this.formatter.buildMarkdown({
            ...job,
            seekUrl: job.seekUrl || job.url
        });
        const gistUrl = await client.createJobGist(markdown, job);

        job.seekUrl = job.seekUrl || job.url;
        job.gistUrl = gistUrl;
        job.url = gistUrl; // used by CSV export

        return job;
    }
}

const markdownJobFormatter = new MarkdownJobFormatter();
const jobGistService = new JobGistService(markdownJobFormatter);

function extractJobDataFromPage(url) {
    const jobData = {
        state: '',
        suburbs: '',
        jobTitle: '',
        company: '',
        salary: '',
        postedDate: '',
        contactEmail: '',
        url: url,
        seekUrl: url,
        jobHtml: '',
        descriptionHtml: ''
    };

    const titleSelectors = [
        'h1[data-automation="job-detail-title"]',
        'h1.job-title',
        '[data-testid="job-title"]',
        'h1'
    ];
    for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent?.trim()) {
            jobData.jobTitle = element.textContent.trim();
            break;
        }
    }

    const companySelectors = [
        '[data-automation="advertiser-name"]',
        'span[data-automation="job-detail-company"]',
        '[data-testid="advertiser-name"]',
        '.advertiser-name'
    ];
    for (const selector of companySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent?.trim()) {
            jobData.company = element.textContent.trim();
            break;
        }
    }

    const locationSelectors = [
        '[data-automation="job-detail-location"]',
        'span[data-automation="job-detail-location"] span',
        '[data-testid="job-detail-location"]',
        '.location-info'
    ];
    for (const selector of locationSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent?.trim()) {
            const locationText = element.textContent.trim();
            const parts = locationText.split(',').map(p => p.trim());

            // if (parts.length === 2) {
            //     jobData.suburbs = parts[0];
            //     const statePart = parts[1];
            //     if (statePart.includes('NSW')) jobData.state = 'Sydney (NSW)';
            //     else if (statePart.includes('VIC')) jobData.state = 'Melbourne (VIC)';
            //     else if (statePart.includes('QLD')) jobData.state = 'Brisbane (QLD)';
            //     else jobData.state = statePart;
            // } else if (parts.length === 1) {
            //     jobData.state = parts[0];
            // }

            function formatLocation(statePart) {
                const stateMap = {
                    'NSW': 'Sydney (NSW)',
                    'VIC': 'Melbourne (VIC)',
                    'QLD': 'Brisbane (QLD)'
                };
                const match = Object.keys(stateMap).find(key => statePart.includes(key));
                return match ? stateMap[match] : statePart;

            }

            if (parts.length === 2) {
                jobData.suburbs = parts[0];
                jobData.state = formatLocation(parts[1]);
            } else if (parts.length === 1) {
                jobData.state = formatLocation(parts[0]);
            }


            break;
        }
    }

    const salarySelectors = [
        '[data-automation="job-detail-salary"]',
        'span[data-automation="job-detail-salary"]',
        '[data-testid="job-salary"]',
        '.salary-info'
    ];
    for (const selector of salarySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent?.trim()) {
            jobData.salary = element.textContent.trim();
            break;
        }
    }

    // // Default salary if missing
    // if (!jobData.salary) {
    //     jobData.salary = '-';
    // }

    // Try to locate the main job content container first
    const jobContainer = document.querySelector('[data-automation="job-view-container"]') || document;
    if (jobContainer) {
        jobData.jobHtml = jobContainer.innerHTML;
    }

    //These selectors below are inaccurate, better to scope within the jobContainer only, find regex match

    // const dateSelectors = [
    //     'span[data-automation="job-detail-date"]',
    //     '[data-automation="job-detail-date"]',
    //     'time',
    //     '.posted-date'
    // ];

    // Loop through selectors within the scoped container
    // for (const selector of dateSelectors) {
    //     const element = jobContainer.querySelector(selector);
    //     if (element && element.textContent?.trim()) {
    //         jobData.postedDate = element.textContent.trim();
    //         break;
    //     }
    // }

    function getActualDate(postedString) {

        const now = new Date();
        const match = postedString.match(/Posted\s+(\d+).*?([a-z]+)/i);

        if (match) {
            const num = parseInt(match[1], 10);
            const unit = match[2];

            if (unit === 'd') {
                now.setDate(now.getDate() - num);
            }

            return now.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        }

        return postedString;
    }

    // Fallback: if nothing found, perform a lightweight regex scan inside the same container
    const textMatch = [...jobContainer.querySelectorAll('span, p, div')]
        .map(e => e.innerText.trim())
        .find(t => /^Posted\s+\d+\w*\+?\s+ago/i.test(t));

    if (textMatch) jobData.postedDate = getActualDate(textMatch);

    function extractEmailFromDescription() {
        const jobDescriptionSelectors = [
            '[data-automation="jobAdDetails"]',
            '[data-automation="jobDescription"]',
            '.job-description',
            '#jobDetailsSection',
            'article',
            'main'
        ];

        let descriptionElement = null;
        for (const selector of jobDescriptionSelectors) {
            descriptionElement = document.querySelector(selector);
            if (descriptionElement) break;
        }

        if (!descriptionElement) {
            descriptionElement = document.body;
        }

        const descriptionText = descriptionElement ? descriptionElement.innerText : '';
        if (descriptionElement) {
            jobData.descriptionHtml = descriptionElement.innerHTML;
        }

        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const emails = descriptionText.match(emailRegex);

        if (emails && emails.length > 0) {
            return emails[0];
        }

        return '';
    }

    jobData.contactEmail = extractEmailFromDescription();

    if (!jobData.descriptionHtml && jobContainer) {
        jobData.descriptionHtml = jobContainer.innerHTML;
    }

    return jobData;

}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startMultiExtraction') {
        handleMultiExtraction(request.urls);
        sendResponse({ success: true });
    } else if (request.action === 'getExtractionState') {
        sendResponse(extractionState);
    } else if (request.action === 'scrapingProgress' ||
        request.action === 'scrapingComplete' ||
        request.action === 'scrapingError') {
        safeSendMessage(request);
    } else if (request.action === 'fetchApolloData') {
        fetchApolloData(request.data.linkedinUrl, request.data.apiKey)
            .then(data => sendResponse({ data }))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Keep channel open for async response
    } else if (request.action === 'fetchApolloDataBulk') {
        fetchApolloDataBulk(request.data.linkedinUrls, request.data.apiKey)
            .then(data => sendResponse({ data }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    } else if (request.action === 'fetchFindymailData') {
        fetchFindymailData(request.data.linkedinUrl, request.data.apiKey)
            .then(data => sendResponse({ data }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    } else if (request.action === 'fetchFindymailDataBulk') {
        fetchFindymailDataBulk(request.data.linkedinUrls, request.data.apiKey)
            .then(data => sendResponse({ data }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
    return true;
});

async function fetchApolloData(linkedinUrl, apiKey) {
    try {
        const response = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey
            },
            body: JSON.stringify({
                linkedin_url: linkedinUrl
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Apollo API Error: ${response.status} ${text}`);
        }

        return await response.json();
    } catch (error) {
        throw error;
    }
}

// Bulk Apollo processing - processes 5 URLs in parallel
async function fetchApolloDataBulk(linkedinUrls, apiKey) {
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < linkedinUrls.length; i += batchSize) {
        const batch = linkedinUrls.slice(i, Math.min(i + batchSize, linkedinUrls.length));

        // Process batch in parallel
        const batchPromises = batch.map(url =>
            fetchApolloData(url, apiKey)
                .then(data => ({ url, data, success: true }))
                .catch(error => ({ url, error: error.message, success: false, data: null }))
        );

        // Batch / parallel processing - use Promise.allSettled
        const batchResults = await Promise.allSettled(batchPromises);

        // Process settled results
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({
                    url: batch[index],
                    error: result.reason?.message || 'Unknown error',
                    success: false,
                    data: null
                });
            }
        });

        // Small delay between batches to respect rate limits (only if more batches remain)
        if (i + batchSize < linkedinUrls.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}

async function fetchFindymailData(linkedinUrl, apiKey) {
    try {
        // Create a timeout promise (30 seconds)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Findymail API timeout after 30 seconds')), 30000);
        });

        // Use the correct endpoint: /api/search/business-profile - return first name. 
        // last name, email and domain from linkedin URL
        const fetchPromise = fetch('https://app.findymail.com/api/search/business-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                linkedin_url: linkedinUrl,
                webhook_url: null
            })
        });

        // Race between fetch and timeout
        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 404) return null; // Not found
            throw new Error(`Findymail API Error: ${response.status} ${text}`);
        }

        const data = await response.json();

        // Handle Findymail response structure: {"payload": {"contact": {"email": "...", "name": "...", "domain": "..."}}}
        // OR sometimes: {"data": {"contact": {"email": "...", "name": "...", "domain": "..."}}}
        // OR: {"contact": {"email": "...", "name": "...", "domain": "..."}}

        let contact = null;

        // Try different response structures
        if (data.payload && data.payload.contact) {
            contact = data.payload.contact;
        } else if (data.data && data.data.contact) {
            contact = data.data.contact;
        } else if (data.contact) {
            contact = data.contact;
        }

        // Return structured data 
        if (contact && contact.email) {
            return {
                email: contact.email,
                name: contact.name || '',
                domain: contact.domain || '',
                first_name: contact.name ? contact.name.split(' ')[0] : '',
                last_name: contact.name ? contact.name.split(' ').slice(1).join(' ') : ''
            };
        }
        return null;
    } catch (error) {
        console.error("Findymail fetch error:", error);
        if (error.message.includes('timeout')) {
            throw new Error('Findymail API request timed out after 30 seconds');
        }
        throw error;
    }
}

// Bulk Findymail processing - processes 5 URLs in parallel per batch
async function fetchFindymailDataBulk(linkedinUrls, apiKey) {
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < linkedinUrls.length; i += batchSize) {
        const batch = linkedinUrls.slice(i, Math.min(i + batchSize, linkedinUrls.length));

        // Process batch in parallel (each has 20s timeout protection)
        const batchPromises = batch.map(url =>
            fetchFindymailData(url, apiKey)
                .then(data => ({ url, data, success: true }))
                .catch(error => ({ url, error: error.message, success: false, data: null }))
        );

        const batchResults = await Promise.allSettled(batchPromises);

        // Process settled results
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({
                    url: batch[index],
                    error: result.reason?.message || 'Please copy and paste the URL into the browser and try again.',
                    success: false,
                    data: null
                });
            }
        });

        // Small delay between batches to respect rate limits (only if more batches remain)
        if (i + batchSize < linkedinUrls.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}

// Multi job listing url extraction 
async function handleMultiExtraction(urls) {
    extractionState = {
        isRunning: true,
        urls: urls,
        currentIndex: 0,
        results: [],
        errors: []
    };

    const batchSize = 4;

    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, Math.min(i + batchSize, urls.length));
        const batchPromises = batch.map((url, batchIndex) =>
            extractSingleJob(url, i + batchIndex)
        );

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                extractionState.results.push(result.value);
            } else {
                extractionState.errors.push({
                    url: batch[index],
                    error: result.reason?.message || 'Please copy and paste the URL into the browser and try again.'
                });
            }
        });

        extractionState.currentIndex = Math.min(i + batchSize, urls.length);

        safeSendMessage({
            action: 'multiExtractionProgress',
            progress: {
                current: extractionState.currentIndex,
                total: urls.length,
                results: extractionState.results.length,
                errors: extractionState.errors.length
            }
        });
    }

    extractionState.isRunning = false;

    safeSendMessage({
        action: 'multiExtractionComplete',
        results: extractionState.results,
        errors: extractionState.errors
    });
}

async function extractSingleJob(url, index) {
    console.log(`[${index}] Starting extraction for:`, url);

    let tabId = null;
    let timeoutId = null;

    const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (tabId) {
            console.log(`[${index}] Closing tab ${tabId}`);
            tabs.remove(tabId).catch(() => { });
            tabId = null;
        }
    };

    try {
        // 20-second extraction timeout
        timeoutId = setTimeout(() => {
            console.error(`[${index}] Extraction timeout for:`, url);
            cleanup();
        }, 20000);

        // 1. Create tab (promisified)
        const tab = await tabs.create({ url, active: false });
        if (!tab || !tab.id) throw new Error("Failed to create tab");

        tabId = tab.id;
        console.log(`[${index}] Created tab ${tabId}, waiting for page load...`);

        // 2. Retry up to 3 times checking loading state
        async function attemptExtraction(attempt = 1, max = 3) {
            console.log(`[${index}] Attempt ${attempt}/${max}`);

            const info = await tabs.get(tabId);
            console.log(`[${index}] Tab status: ${info.status}`);

            if (info.status === "loading" && attempt < max) {
                await new Promise(res => setTimeout(res, 2000));
                return attemptExtraction(attempt + 1, max);
            }

            console.log(`[${index}] Injecting script...`);
            const resultArr = await scripting.execute({
                target: { tabId },
                func: extractJobDataFromPage,
                args: [url]
            });

            const result = resultArr?.[0]?.result;
            if (!result) throw new Error("No data extracted from page");

            console.log(`[${index}] Extraction successful`);
            return result;
        }

        // Initial 3-second delay before retry loop
        await new Promise(res => setTimeout(res, 3000));

        const rawData = await attemptExtraction();
        let finalData = { ...rawData };

        try {
            finalData = await jobGistService.attachGistUrl(finalData);
        } catch (gistError) {
            console.error(`[${index}] Gist creation failed:`, gistError);
            finalData.gistError = gistError.message;
            // Ensure we always have at least the original Seek URL
            if (!finalData.url && rawData && rawData.url) {
                finalData.url = rawData.url;
            }
        }

        cleanup();
        return finalData;

    } catch (err) {
        cleanup();
        throw err;
    }
}
