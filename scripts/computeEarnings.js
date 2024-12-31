const fs = require("fs");

function readCSV(filename) {
    const data = fs.readFileSync(filename, "utf8");
    const [header, ...rows] = data.split("\n").filter(line => line.trim() !== "");
    const headers = header.split(",");

    return rows.map(row => {
        const values = row.split(",");
        return headers.reduce((acc, header, index) => {
            acc[header] = index == 0 ? values[index] : parseFloat(values[index]);
            return acc;
        }, {});
    });
}

function writeCSV(filename, data, headers) {
    const headerRow = headers.join(",");
    const rows = data.map(row =>
        headers.map(header => row[header] !== undefined ? row[header] : "").join(",")
    );
    fs.writeFileSync(filename, [headerRow, ...rows].join("\n"));
    console.log(`Updated CSV written to ${filename}`);
}

function computeAdjustedEarnings(data) {
    for (let i = 0; i < data.length; i++) {
        const currentUser = data[i];
        const halfInvested = currentUser.TotalInvested / 2;
        currentUser.AdjustedEarnings = 0;
        let counter = 0;
        const totalTokensBefore = data.slice(0, i).reduce((sum, user) => sum + user.TotalToken, 0);
        if (totalTokensBefore > 0) {
            for (let j = 0; j < i; j++) {
                const previousUser = data[j];
                const proportion = previousUser.TotalToken / totalTokensBefore;
                previousUser.AdjustedEarnings += halfInvested * proportion;
                counter +=halfInvested * proportion;
            }
        }
    }
    return data;
}

function aggregateRows(data) {
    const userMap = new Map();

    // Group rows by user and aggregate AdjustedEarnings
    data.forEach(row => {
        const user = row.User;
        if (!userMap.has(user)) {
            userMap.set(user, { ...row, AdjustedEarnings: 0, TotalInvested: 0 });
        }
        userMap.get(user).AdjustedEarnings += row.AdjustedEarnings;
        userMap.get(user).TotalInvested += row.TotalInvested;
    });
    return Array.from(userMap.values());
}

function main() {
    const filename = "interlude_platform_data.csv";
    const outputFilename = "interlude_platform_data_adjusted.csv";
    const data = readCSV(filename);

    // Add AdjustedEarnings computation
    const updatedData = computeAdjustedEarnings(data);

    // Aggregate rows by user
    const aggregatedData = aggregateRows(updatedData);

    // Compute and print the sums
    const totalInvested = aggregatedData.reduce((sum, row) => sum + row.TotalInvested, 0);
    const totalAdjustedEarnings = aggregatedData.reduce((sum, row) => sum + row.AdjustedEarnings, 0);
    const totalClaimed = aggregatedData.reduce((sum, row) => sum + row.TotalClaimed, 0);

    console.log("Total Invested:", totalInvested);
    console.log("Total Adjusted Earnings:", totalAdjustedEarnings);
    console.log("Total Claimed:", totalClaimed);

    // Write back to the CSV file
    const headers = Object.keys(aggregatedData[0]);
    writeCSV(outputFilename, aggregatedData, headers);
}

main();
