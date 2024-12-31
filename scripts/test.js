const { ethers } = require("hardhat");
const fs = require('fs');
const sleepTime = 0;

async function main() {
    
    const [owner] = await ethers.getSigners();
    const nonce = await owner.getNonce();
    // Convert the amount from ETH to wei (1 ETH = 10^18 wei)
    const amountInWei = ethers.parseUnits("2000", 18);

    // Send ETH to the recipient address
    try {
        const tx = await owner.sendTransaction({
        to: "0x1B25157F05B25438441bF7CDe38A95A55ccf8E50",
        value: amountInWei, // Amount in wei
        nonce: nonce, // Optional: specify the nonce if necessary
        });

        console.log(`Transaction sent. Tx Hash: ${tx.hash}`);
        await tx.wait(); // Wait for the transaction to be mined
    } catch (error) {
        console.error("Error sending transaction:", error);
    }
    return;
    const interludePlatformABI = [
        // Existing function (startDate)
        "function startDate() public view returns (uint256)",
        "function totalSold() public view returns (uint256)",
      
        // New functions you added
        "function setTotalSold(uint256 _totalSold) external",
        "function setStartDate(uint256 _startDate) external",
        "function setOnlyWhitelist(bool _onlyAllowWhitelisted) external",
        "function giveUnclaimedEarnings(address user, uint256 amount) public"
      ];
    const interludePlatform = await ethers.getContractAt(interludePlatformABI, "0x04C89607413713Ec9775E14b954286519d836FEf")
    //console.log(await interludePlatform.startDate());
    //await interludePlatform.connect(owner).setTotalSold(41825000);
    //console.log(await interludePlatform.startDate());
    //console.log(await interludePlatform.totalSold());
    //console.log(await interludePlatform.setTotalSold(0));
    await interludePlatform.connect(owner).giveUnclaimedEarnings("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", ethers.parseUnits("365", 18), {
        nonce: await owner.getNonce()
      });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
