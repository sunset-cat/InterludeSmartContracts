const fs = require('fs');
const cheerio = require('cheerio');

(async function() {
  try {
    // Path to the local HTML file
    const filePath = 'C:/Users/Utilisateur/Downloads/page.html'
    // Read the HTML content synchronously
    const html = fs.readFileSync(filePath, 'utf-8');

    // Parse the HTML content
    const $ = cheerio.load(html);

    // Array to store Twitter links
    const twitterLinks = [];

    // Find all strings matching 'alt="Avatar of $name"'
    $('img[alt]').each((index, element) => {
      const altText = $(element).attr('alt');

      // Match the pattern 'Avatar of $name'
      const match = altText && altText.match(/^Avatar of (.+)$/);
      if (match) {
        const name = match[1];
        const twitterLink = `https://x.com/${name}`;
        twitterLinks.push(twitterLink);
      }
    });

    // Convert the Twitter links to CSV format
    const csvContent = twitterLinks.join('\n');

    // Save the CSV content to a file
    const outputFilePath = 'twitter_links.csv';
    fs.writeFileSync(outputFilePath, csvContent);

    console.log(`CSV file created successfully: ${outputFilePath}`);
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
