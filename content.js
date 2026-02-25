let allJobs = [];
let isExtracting = false;

function detectWebsite() {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes('seek.com.au')) {
        return 'seek';
    } 
    return null;
}

function validateJobUrl(url) {
    if (!url || url === 'N/A' || !url.startsWith('http')) {
        return false;
    }

    const website = detectWebsite();
    if (website === 'seek') {
        if (!url.includes('seek.com') || (!url.includes('/job/') && !url.includes('/jobs/')) && !url.includes('jobId')) {
            return false;
        }
    }

    return true;
}

function extractJobFromCard(card, website, cardIndex) {
    let jobData = {
        jobTitle: '',
        company: '',
        location: '',
        salary: '',
        jobUrl: '',
    };

    try {
        const linkedTitleSelectors = website === 'seek' ? [
            'h3 a[data-automation="jobTitle"]',
            'a[data-automation="jobTitle"]',
            '[data-testid="job-title"] a',
            'h3 a[href*="/job"]',
            'h2 a[href*="/job"]',
        ] : [
            'h2 a[href*="/job"]',
            'h3 a[href*="/job"]',
            '.job-title a[href*="/job"]',
            '[data-automation="job-title"] a',
            'a[data-automation="jobTitle"]'
        ];

        let titleElement = null;
        for (const selector of linkedTitleSelectors) {
            titleElement = card.querySelector(selector);
            if (titleElement && titleElement.href && titleElement.textContent?.trim()) {
                const href = titleElement.href;
                const title = titleElement.textContent.trim();

                if (validateJobUrl(href)) {
                    jobData.jobTitle = title;
                    jobData.jobUrl = href;
                    break;
                }
            }
        }

        if (jobData.jobTitle === '' || jobData.jobUrl === '') {
            const titleTextSelectors = website === 'seek' ? [
                'h3[data-automation="jobTitle"]',
                '[data-testid="job-title"]',
                'h3:not(:has(a))',
                'h2:not(:has(a))'
            ] : [
                'h2:not(:has(a))',
                'h3:not(:has(a))',
                '[data-automation="job-title"]:not(a)',
                '.job-title:not(a)'
            ];

            for (const selector of titleTextSelectors) {
                const titleTextElement = card.querySelector(selector);
                if (titleTextElement && titleTextElement.textContent?.trim()) {
                    jobData.jobTitle = titleTextElement.textContent.trim();
                    break;
                }
            }

            const jobLinkSelectors = website === 'seek' ? [
                'a[href*="/job/"][data-automation*="job"]',
                'a[href*="/jobs/"][data-automation*="job"]',
                'a[href*="jobId"]',
                'a[href*="/job/"]:not([data-automation*="company"]):not([data-automation*="location"])'
            ] : [
                'a[href*="/job"][data-automation*="job"]',
                'a[href*="/en/job"]',
                'a[href*="/job"]:not([data-automation*="company"]):not([data-automation*="location"])'
            ];

            for (const selector of jobLinkSelectors) {
                const linkElement = card.querySelector(selector);
                if (linkElement && linkElement.href) {
                    const href = linkElement.href;
                    if (validateJobUrl(href)) {
                        jobData.jobUrl = href;
                        break;
                    }
                }
            }
        }

        const companySelectors = website === 'seek' ? [
            '[data-automation="jobCompany"] a',
            '[data-automation="jobCompany"]',
            '[data-testid="job-company"]',
            '.company-name',
            'span[title]'
        ] : [
            '[data-automation="job-company"]',
            '.company-name',
            '.job-company',
            '[data-testid="job-company"]',
            '.company'
        ];

        for (const selector of companySelectors) {
            const companyElement = card.querySelector(selector);
            if (companyElement && companyElement.textContent?.trim()) {
                jobData.company = companyElement.textContent.trim();
                break;
            }
        }

        const locationSelectors = website === 'seek' ? [
            '[data-automation="jobLocation"] a',
            '[data-automation="jobLocation"]',
            '[data-testid="job-location"]',
            '.job-location',
            'span[data-automation="jobSuburb"]'
        ] : [
            '[data-automation="job-location"]',
            '.location',
            '.job-location',
            '[data-testid="job-location"]',
            '.job-location-text'
        ];

        for (const selector of locationSelectors) {
            const locationElement = card.querySelector(selector);
            if (locationElement && locationElement.textContent?.trim()) {
                jobData.location = locationElement.textContent.trim();
                break;
            }
        }

        const salarySelectors = website === 'seek' ? [
            '[data-automation="jobSalary"]',
            '[data-testid="jobSalary"]',
            '[data-testid="job-salary"]',
            '.job-salary',
            '.salary',
            '.salary-info',
            '.salary-range',
            'span[data-automation="jobSalary"]',
            'span[data-testid="jobSalary"]',
            'span[data-testid="job-salary"]'
        ] : [
            '[data-automation="job-salary"]',
            '[data-testid="job-salary"]',
            '.job-salary',
            '.salary',
            '.pay-rate',
            '.salary-text',
            '.salary-range',
            '.package',
            'span.salary',
            'div.salary'
        ];

        for (const selector of salarySelectors) {
            const salaryElement = card.querySelector(selector);
            if (salaryElement && salaryElement.textContent?.trim()) {
                jobData.salary = salaryElement.textContent.trim();
                break;
            }
        }

        if (jobData.jobUrl && jobData.jobUrl !== '') {
            let url = jobData.jobUrl;

            if (url.startsWith('/')) {
                const baseUrl = website === 'seek' && 'https://www.seek.com.au';
                url = baseUrl + url;
            } else if (!url.startsWith('http')) {
                const baseUrl = website === 'seek' && 'https://www.seek.com.au/';
                url = baseUrl + url;
            }

            if (validateJobUrl(url)) {
                jobData.jobUrl = url;
            } else {
                jobData.jobUrl = '';
            }
        }

        const isValidJob = (
            jobData.jobTitle !== '' &&
            jobData.jobUrl !== '' &&
            jobData.jobTitle.length >= 2 &&
            validateJobUrl(jobData.jobUrl));
        
        if (cardIndex < 3) {
            console.log(`Card ${cardIndex + 1} (${website}):`, {
                ...jobData,
                isValid: isValidJob,
                cardHTML: card.outerHTML.substring(0, 200) + '...'
            });
        }

        return isValidJob ? jobData : null;

    } catch (error) {
        console.warn(`Error extracting job data from card ${cardIndex}: `, error);
        return null;
    }
}

function extractSingleJobPageData() {
    console.log('Extracting job data from:', window.location.href);

    const jobData = {
        state: '',
        suburbs: '',
        jobTitle: '',
        company: '',
        salary: '',
        postedDate: '',
        url: window.location.href
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
            console.log('Found title:', jobData.jobTitle);
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

            if (parts.length >= 2) {
                jobData.suburbs = parts[0];
                const statePart = parts[1];
                if (statePart.includes('NSW')) jobData.state = 'Sydney (NSW)';
                else if (statePart.includes('VIC')) jobData.state = 'Melbourne (VIC)';
                else if (statePart.includes('QLD')) jobData.state = 'Brisbane (QLD)';
                else jobData.state = statePart;
            } else if (parts.length === 1) {
                jobData.suburbs = parts[0];
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

    const dateSelectors = [
        'span[data-automation="job-detail-date"]',
        '[data-automation="job-detail-date"]',
        'time',
        '.posted-date'
    ];
    for (const selector of dateSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent?.trim()) {
            jobData.postedDate = element.textContent.trim();
            break;
        }
    }

    if (!jobData.salary) {
        jobData.salary = '-';
    }

    console.log('Extracted job data:', jobData);
    return jobData;
}

function scrapeSeekJobs() {
    const jobs = [];
    const jobCards = document.querySelectorAll('article[data-testid="job-card"], [data-automation="normalJob"], [data-testid="job-result"], div[data-card-type="JobCard"], .job-card, article');

    console.log(`Found ${jobCards.length} job cards on Seek page`);

    jobCards.forEach((card, index) => {
        const jobData = extractJobFromCard(card, 'seek', index);
        if (jobData) {
            jobs.push(jobData);
        }
    });

    console.log(`Extracted ${jobs.length} valid jobs from current Seek page`);
    return jobs;
}


function findNextPageButton() {
    const website = detectWebsite();

    if (website === 'seek') {
        const nextButtons = [
            '[data-automation="page-next"]',
            'a[aria-label="Next"]',
            '.next',
            'a[aria-label="Go to next page"]',
            '[data-testid="pagination-next"]'
        ];

        for (const selector of nextButtons) {
            const button = document.querySelector(selector);
            if (button && !button.disabled && !button.classList.contains('disabled') && !button.hasAttribute('aria-disabled')) {
                return button;
            }
        }
    }
    return null;
}

async function scrapeAllPages() {
    if (isExtracting) return;

    isExtracting = true;
    allJobs = [];

    const website = detectWebsite();
    if (!website) {
        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: 'Unsupported website. Please use Seek'
        });
        isExtracting = false;
        return;
    }

    console.log(`Starting extraction on ${website}`);

    let pageCount = 1;
    let maxPages = 50;

    try {
        while (pageCount <= maxPages) {
            console.log(`Processing page ${pageCount}`);

            chrome.runtime.sendMessage({
                action: 'scrapingProgress',
                page: pageCount,
                jobCount: allJobs.length
            });

            await new Promise(resolve => setTimeout(resolve, 2000));

            let pageJobs = [];
            if (website === 'seek') {
                pageJobs = scrapeSeekJobs();
            }

            if (pageJobs.length === 0 && pageCount > 1) {
                console.log('No more valid jobs found, stopping extraction');
                break;
            }

            allJobs.push(...pageJobs);

            allJobs = Array.from(
                new Map(allJobs.map(job => [
                    `${job.jobTitle} || ${job.company} || ${job.location}`, job
                ])).values()
            );
            console.log(`Total validated jobs collected so far: ${allJobs.length}`);

            const nextButton = findNextPageButton();
            if (!nextButton) {
                console.log('No next page button found, stopping extraction');
                break;
            }

            nextButton.click();
            pageCount++;

            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log(`Extraction complete! Total validated jobs: ${allJobs.length}, Pages processed: ${pageCount - 1} `);

        chrome.runtime.sendMessage({
            action: 'scrapingComplete',
            jobs: allJobs,
            totalPages: pageCount - 1
        });

    } catch (error) {
        console.error('Scraping error:', error);
        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: error.message
        });
    }

    isExtracting = false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startScraping') {
        scrapeAllPages();
        sendResponse({ success: true });
    } else if (request.action === 'getJobs') {
        sendResponse({ jobs: allJobs });
    } else if (request.action === 'extractJobData') {
        console.log('Received extractJobData request for URL:', request.url);
        try {
            const jobData = extractSingleJobPageData();
            console.log('Sending extracted data back to background:', jobData);
            chrome.runtime.sendMessage({
                action: 'jobDataExtracted',
                data: jobData
            });
            sendResponse({ success: true, data: jobData });
        } catch (error) {
            console.error('Error extracting job data:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    return true;
});
