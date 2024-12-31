// Required imports
const fs = require("fs");

// Function to read CSV and sum specified columns
function sumColumns(filename, columns) {
    const data = fs.readFileSync(filename, { encoding: "utf8" });
    const rows = data.split("\n").filter(line => line.trim() !== "");

    // Extract header and validate columns
    const header = rows[0].split(",");
    const columnIndices = columns.map(column => {
        const index = header.indexOf(column);
        if (index === -1) {
            throw new Error(`Column '${column}' not found in CSV header.`);
        }
        return index;
    });

    // Sum values in specified columns
    const sums = new Array(columns.length).fill(0);
    for (const row of rows.slice(1)) {
        const values = row.split(",");
        columnIndices.forEach((index, i) => {
            const value = parseFloat(values[index]);
            if (!isNaN(value)) {
                sums[i] += value;
            }
        });
    }

    return columns.reduce((result, column, i) => {
        result[column] = sums[i];
        return result;
    }, {});
}


// Main script
try {
    const filename = "interlude_platform_data.csv";
    const columnsToSum = ["AccumulatedEarnings", "UnclaimedEarnings"];
    const results = sumColumns(filename, columnsToSum);

    console.log("Sum of columns:", results);
} catch (error) {
    console.error("Error:", error.message);
}