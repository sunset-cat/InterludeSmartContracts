// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

import "./ERC20.sol";

interface IWhitelist {
    function isWhitelisted(address _address) external view returns (bool);
}

contract Whitelist is IWhitelist {
    // Address of the owner who can manage the whitelist
    address public owner;

    mapping(address => bool) private whitelist;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addAddressToWhitelist(address _address) external onlyOwner {
        whitelist[_address] = true;
    }

    function removeAddressFromWhitelist(address _address) external onlyOwner {
        whitelist[_address] = false;
    }

    function isWhitelisted(address _address) external view override returns (bool) {
        return whitelist[_address];
    }
}

contract InterludePlatform is Ownable {

    IWhitelist public adminWhitelist;

    /* ========== TOKEN INFO ========== */
    MyPausableToken public token;

    /* ========== BONDING CURVE INFO ========== */
    struct Step {
        uint256 size;
        uint256 price;
    }
    Step[] public steps;
    uint256 public startDate;
    uint256 public totalSold;
    bool public onlyAllowWhitelisted;

    uint256 public totalUsers;
    mapping(address => uint256) public spendableTokens;

    /* ========== GEMS & CRYSTAL DATA STRUCTURES ========== */
    struct Asset {
        string name;
        uint256 power;
        uint256 unscaledPrice; //price units
    }
    Asset[] public gems;
    mapping(address => mapping(uint256 => uint256)) public userGems; // User address => Gem index => Amount


    Asset[] public crystals;
    mapping(address => mapping(uint256 => uint256)) public userCrystals; // User address => Crystal index => Amount

    /* ========== EARNING SYSTEM ========== */
    //Every time a user purchases INT from the bonding curve, 50% is sent to the Gems & Crystals holders, proportionally to each user power
    //(the sum of powers of their gems and crystals). In addition there is a variable bonus for crystal holdings that can be changed by the
    //admin. So we need to keep track of total holdings, and user holdings of each type of asset, at time of each purchase.

    //Gems are only for non playing investors. Crystals are used by players: they produce energy that is used to unlock new worlds. In
    //these worlds players find lootchests that contain new crystals. As a result new crystals are minted by the game, and we need to keep
    //track of how many there are vs the amount of INT that is actually staked in crystals to avoid creating new INT.
    //The price of a crystal is its share of the total price units in crystals multiplied by the INT in the pool. For gems since there's no dilution
    //this is simply equal to the unscaledPrice.

    //Global variables
    uint256 public totalGemPower= 0;
    uint256 public totalCrystalPower= 0;

    uint256 public totalIntInGems = 1; //pool of INT staked in gems. equal to totalPriceUnitsInGems
    uint256 public totalIntInCrystals = 1; //pool of INT staked in crystals.
    uint256 public totalPriceUnitsInCrystals = 1; //keeps track of total price units. actual price = INT in pool * crystalPriceUnit / totalPriceUnitsInCrystals

    //User specific variables
    mapping(address => uint256) public currentGemPower;
    mapping(address => uint256) public currentCrystalPower;

    uint256 public cumulativeRewardPerWeightGems;
    mapping(address => uint256) public lastClaimedRewardPerWeightGems;
    uint256 public cumulativeRewardPerWeightCrystals;
    mapping(address => uint256) public lastClaimedRewardPerWeightCrystals;

    mapping(address => uint256) public totalInvested;
    mapping(address => uint256) public investmentAllowance;
    mapping(address => uint256) public unclaimedEarnings;
    mapping(address => uint256) public totalClaimed;

    //Energy system variables
    mapping(address => uint256) public lastTimeEnergyComputed;
    mapping(address => uint256) public generatedEnergy;
    mapping(address => uint256) public collectedEnergy;

    /* ========== REFERRAL PROGRAM ========== */
    mapping(address => uint256) public firstPurchasePhase;//we store phase for first purchase to check for referral program eligibility

    uint256 public referrerCroBonusPercentage = 10;
    uint256 public referrerIntBonusPercentage = 10;
    uint256 public referredIntBonusPercentage = 15;

    mapping(address => uint256) public unclaimedIntReferralBonus;
    mapping(address => uint256) public unclaimedCroReferralBonus;
    mapping(address => uint256) public totalClaimedIntReferralBonus;
    mapping(address => uint256) public totalClaimedCroReferralBonus;


    bool public restrictReferralProgramToPartners = true;
    IWhitelist public partnersWhitelist;
    IWhitelist public generalWhitelist;

    /* ========== EVENTS ========== */
    event TokenPurchase(address indexed buyer, uint256 value, uint256 referrerCroBonus, uint256 referrerIntBonus, uint256 referredIntBonus);
    event EarningsClaim(address indexed user, uint256 amount);
    event EarningsReserve(address indexed user, uint256 amount);
    event ReferralBonusClaim(address indexed user, uint256 croAmount, uint256 intAmount);
    event EnergyCollected(address indexed user, uint256 energyAmount);
    event AssetTransaction(address indexed user, bool isCrystal, bool isBuy, uint index, uint quantity);
    event CrystalMint(address indexed user, uint index, uint quantity);

    /* ========== CONSTRUCTOR ========== */

    constructor(address payable _owner, address tokenAddress) Ownable(_owner){
        token = MyPausableToken(tokenAddress);
    }

    /* ========== BONDING CURVE ========== */
    //Functions to buy tokens according to the step function bonding curve, with referral bonus.

    function buyToken(address referralAddress) external payable {
        require(msg.value > 0, "Must send CRO");
        require(!onlyAllowWhitelisted || generalWhitelist.isWhitelisted(msg.sender), "Not on the whitelist!");
        require(block.timestamp > startDate, "Sale is not open!");

        uint256 tokensToBuy = _calculateTokensToBuy(msg.value);
        require(tokensToBuy > 0, "Not enough CRO");

        if(referralAddress == address(0)){
            referralAddress = msg.sender;
        }
        bool isEligibleForReferral = eligibleForReferral(referralAddress);

        totalSold += tokensToBuy;

        uint256 croToRedistribute = msg.value / 2;

        //Referral bonus if eligible
        uint256 referredIntBonus = 0;
        uint256 referrerCroBonus = 0;
        uint256 referrerIntBonus = 0;
        if(isEligibleForReferral){

            referredIntBonus = tokensToBuy * referredIntBonusPercentage / 100;

            if(referralAddress != address(0)){
                referrerIntBonus = tokensToBuy * referrerIntBonusPercentage / 100;
                referrerCroBonus = msg.value * referrerCroBonusPercentage / 100;
            }

            unclaimedCroReferralBonus[referralAddress] += referrerCroBonus;
            unclaimedIntReferralBonus[referralAddress] += referrerIntBonus;
        }

        uint256 totalTokens = tokensToBuy + referredIntBonus;
        giveToken(msg.sender, totalTokens);

        emit TokenPurchase(msg.sender, tokensToBuy, referrerCroBonus, referrerIntBonus, referredIntBonus);

        uint256 croToOwner = msg.value - (croToRedistribute + referrerCroBonus);
        payable(owner()).transfer(croToOwner);

        totalInvested[msg.sender] += msg.value;

        if (totalIntInGems + totalIntInCrystals > 0) {
            uint256 gemsCroToRedistribute = croToRedistribute * totalIntInGems / (totalIntInGems + totalIntInCrystals);
            uint256 crystalsCroToRedistribute = croToRedistribute - gemsCroToRedistribute;

            if (totalGemPower > 0) {
                cumulativeRewardPerWeightGems += (gemsCroToRedistribute * 1e18) / totalGemPower;
            }

            if (totalCrystalPower > 0) {
                cumulativeRewardPerWeightCrystals += (crystalsCroToRedistribute * 1e18) / totalCrystalPower;
            }
        }
    }

    function _calculateTokensToBuy(uint256 croAmount) internal view returns (uint256) {
        uint256 tokensToBuy = 0;
        uint256 croRemaining = croAmount;
        uint256 cumulativeTokensSold = totalSold; // Start with total tokens sold

        for (uint256 i = 0; i < steps.length && croRemaining > 0; i++) {
            Step memory currentStep = steps[i];

            // Calculate cumulative tokens available up to this step
            uint256 cumulativeStepTokens = 0;
            for (uint256 j = 0; j <= i; j++) {
                cumulativeStepTokens += steps[j].size;
            }

            // Calculate the tokens available in the current step based on cumulative tokens sold
            uint256 availableTokensInStep = cumulativeStepTokens > cumulativeTokensSold
                ? cumulativeStepTokens - cumulativeTokensSold
                : 0;

            // If no tokens are available in this step, continue to the next step
            if (availableTokensInStep == 0) continue;

            // Calculate the CRO needed to buy all available tokens at the current step price
            uint256 croNeededForStep = availableTokensInStep * currentStep.price;

            if (croRemaining >= croNeededForStep) {
                // Buy all available tokens in the step
                tokensToBuy += availableTokensInStep;
                croRemaining -= croNeededForStep;
                cumulativeTokensSold += availableTokensInStep;
            } else {
                // Buy as many tokens as possible with the remaining CRO
                tokensToBuy += croRemaining / currentStep.price;
                croRemaining = 0;
            }
        }

        return tokensToBuy;
    }

    /* ========== EARNING SYSTEM ========== */

    function reserveEarnings(address user) internal {
        uint256 owed = calculateUserUnreservedEarnings(user);

        if (owed > 0) {
            unclaimedEarnings[user] += owed;
            lastClaimedRewardPerWeightGems[user] = cumulativeRewardPerWeightGems;
            lastClaimedRewardPerWeightCrystals[user] = cumulativeRewardPerWeightCrystals;

            emit EarningsReserve(user, owed);
        }
    }

    function claimEarnings() external {
        reserveEarnings(msg.sender);
        uint256 owed = unclaimedEarnings[msg.sender];
        require(owed > 0, "No CRO owed");

        totalClaimed[msg.sender] += owed;
        unclaimedEarnings[msg.sender] = 0;
        payable(msg.sender).transfer(owed);

        emit EarningsClaim(msg.sender, owed);
    }

    function calculateUserEarnings(address user) public view returns (uint256) {
        return calculateUserUnreservedEarnings(user) + unclaimedEarnings[user];
    }

    function calculateUserUnreservedEarnings(address user) internal view returns (uint256) {
        uint256 unclaimedPartGems = (cumulativeRewardPerWeightGems - lastClaimedRewardPerWeightGems[user]) * currentGemPower[user];
        uint256 unclaimedPartCrystals = (cumulativeRewardPerWeightCrystals - lastClaimedRewardPerWeightCrystals[user]) * currentCrystalPower[user];

        return (unclaimedPartGems + unclaimedPartCrystals) / 1e18;
    }

    //called whevener user power changes (e.g. when buying, selling or finding an asset)
    function updateEnergyAndReserveEarnings(address user) internal {
        reserveEarnings(user);

        updateEnergy(user);
    }

    //called whevener user power changes (e.g. when buying, selling or finding an asset)
    function updateEnergy(address user) internal {
        if(lastTimeEnergyComputed[user] == 0){
            lastTimeEnergyComputed[user] = block.timestamp;
        }
        generatedEnergy[user] += currentCrystalPower[user] * (block.timestamp - lastTimeEnergyComputed[user]);
        lastTimeEnergyComputed[user] = block.timestamp;
    }

    //used by the game server
    function collectEnergy(address user) external returns (uint256) {
        require(adminWhitelist.isWhitelisted(msg.sender) || msg.sender == owner(), "Caller is not an admin");

        //first update the generated energy
        updateEnergy(user);

        //then update the collected energy, send it as result to the server.
        uint256 uncollectedEnergy = generatedEnergy[user] - collectedEnergy[user];
        collectedEnergy[user] = generatedEnergy[user];
        emit EnergyCollected(user, uncollectedEnergy);
        return uncollectedEnergy;
    }

    /* ========== GEMS & CRYSTAL MANAGEMENT ========== */


    //Functions to manage gems and crystals. At each change the user total power will change, so we need to compute
    //the earnings up to this point. We also update the global values (gem and crystal power for all users)
    //Gems and crystals are bought/sold by staking/unstaking INT token.
    function buyGem(uint gemType, uint256 amount) external {
        require(gems[gemType].power > 0, "Gem type does not exist");
        require(amount > 0);

        uint256 totalCost = gems[gemType].unscaledPrice * amount;
        uint256 totalPowerAdded = gems[gemType].power * amount;

        updateEnergyAndReserveEarnings(msg.sender);

        totalIntInGems += totalCost;
        totalGemPower += totalPowerAdded;

        spendToken(msg.sender, totalCost);

        userGems[msg.sender][gemType] += amount;
        currentGemPower[msg.sender] += totalPowerAdded;

        if (lastClaimedRewardPerWeightGems[msg.sender] == 0) {
            lastClaimedRewardPerWeightGems[msg.sender] = cumulativeRewardPerWeightGems;
        }

        if (lastClaimedRewardPerWeightCrystals[msg.sender] == 0) {
            lastClaimedRewardPerWeightCrystals[msg.sender] = cumulativeRewardPerWeightCrystals;
        }

        emit AssetTransaction(msg.sender, false, true, gemType, amount);
    }

    function sellGem(uint gemType, uint256 amount) external {
        require(gems[gemType].power > 0);
        require(userGems[msg.sender][gemType] >= amount, "Not enough gems to sell");
        require(amount > 0);

        uint256 totalRefund = gems[gemType].unscaledPrice * amount;
        uint256 totalPowerRemoved = gems[gemType].power * amount;

        updateEnergyAndReserveEarnings(msg.sender);

        totalGemPower -= totalPowerRemoved;
        totalIntInGems -= totalRefund;

        giveToken(msg.sender, totalRefund);

        userGems[msg.sender][gemType] -= amount;
        currentGemPower[msg.sender] -= totalPowerRemoved;

        emit AssetTransaction(msg.sender, false, false, gemType, amount);
    }

    function buyCrystal(uint crystalType, uint256 amount) external {
        require(crystals[crystalType].power > 0);
        require(amount > 0);

        updateEnergyAndReserveEarnings(msg.sender);

        uint256 totalPowerUnitsAdded = crystals[crystalType].power * amount;
        uint256 totalPriceUnitsAdded = crystals[crystalType].unscaledPrice * amount;
        uint256 totalCost = totalIntInCrystals * totalPriceUnitsAdded / totalPriceUnitsInCrystals;

        totalPriceUnitsInCrystals += totalPriceUnitsAdded;
        totalIntInCrystals += totalCost;
        totalCrystalPower += totalPowerUnitsAdded;

        spendToken(msg.sender, totalCost);

        userCrystals[msg.sender][crystalType] += amount;
        currentCrystalPower[msg.sender] += totalPowerUnitsAdded;

        if (lastClaimedRewardPerWeightGems[msg.sender] == 0) {
            lastClaimedRewardPerWeightGems[msg.sender] = cumulativeRewardPerWeightGems;
        }

        if (lastClaimedRewardPerWeightCrystals[msg.sender] == 0) {
            lastClaimedRewardPerWeightCrystals[msg.sender] = cumulativeRewardPerWeightCrystals;
        }

        emit AssetTransaction(msg.sender, true, true, crystalType, amount);
    }

    function sellCrystal(uint crystalType, uint256 amount) external {
        require(crystals[crystalType].power > 0);
        require(userCrystals[msg.sender][crystalType] >= amount, "Not enough crystals");
        require(amount > 0);

        updateEnergyAndReserveEarnings(msg.sender);

        uint256 totalPowerUnitsRemoved = crystals[crystalType].power * amount;
        uint256 totalPriceUnitsRemoved = crystals[crystalType].unscaledPrice * amount;
        uint256 totalRefund = totalIntInCrystals * totalPriceUnitsRemoved / totalPriceUnitsInCrystals;

        totalPriceUnitsInCrystals -= totalPriceUnitsRemoved;
        totalIntInCrystals -= totalRefund;
        totalCrystalPower -= totalPowerUnitsRemoved;

        giveToken(msg.sender, totalRefund);

        userCrystals[msg.sender][crystalType] -= amount;
        currentCrystalPower[msg.sender] -= totalPowerUnitsRemoved;

        emit AssetTransaction(msg.sender, true, false, crystalType, amount);
    }

    //called by the game server
    function mintCrystal(address user, uint256 crystalType, uint256 amount) public {
        require(adminWhitelist.isWhitelisted(msg.sender) || msg.sender == owner(), "Caller is not an admin");
        require(crystals[crystalType].power > 0);
        require(amount > 0);

        updateEnergyAndReserveEarnings(user);

        uint256 totalPowerUnitsAdded = crystals[crystalType].power * amount;
        uint256 totalPriceUnitsAdded = crystals[crystalType].unscaledPrice * amount;

        totalPriceUnitsInCrystals += totalPriceUnitsAdded;
        totalCrystalPower += totalPowerUnitsAdded;

        userCrystals[user][crystalType] = userCrystals[user][crystalType] + amount;
        currentCrystalPower[user] += totalPowerUnitsAdded;

        emit CrystalMint(user, crystalType, amount);
    }

    /* ========== REFERRAL PROGRAM ========== */
    //User become eligible to the referral program if they invested during the previous phase. Then their address can be used as
    //referral address in the buyToken function.
    //Two whitelists that manage referral eligibility: one that can be set exclusive and one that is used on top of the
    //normal eligibility condition (having invested at previous phase)

    function claimReferralBonus() external {
        require(unclaimedIntReferralBonus[msg.sender] > 0, "No bonus");

        uint256 intReferralBonus = unclaimedIntReferralBonus[msg.sender];
        unclaimedIntReferralBonus[msg.sender] = 0;
        totalClaimedIntReferralBonus[msg.sender] += intReferralBonus;
        giveToken(msg.sender, intReferralBonus);

        uint256 croReferralBonus = unclaimedCroReferralBonus[msg.sender];
        unclaimedCroReferralBonus[msg.sender] = 0;
        totalClaimedCroReferralBonus[msg.sender] += croReferralBonus;
        payable(msg.sender).transfer(croReferralBonus);

        emit ReferralBonusClaim(msg.sender, croReferralBonus, intReferralBonus);
    }

    function restrictReferralProgram(bool _restricted) external onlyOwner {
        restrictReferralProgramToPartners = _restricted;
    }

    function eligibleForReferral(address user) view public returns (bool){
        if(restrictReferralProgramToPartners){
            return address(partnersWhitelist) != address(0) && partnersWhitelist.isWhitelisted(user);
        }
        else{
            return (address(generalWhitelist) != address(0) && generalWhitelist.isWhitelisted(user)) || (firstPurchasePhase[user] > 0 && firstPurchasePhase[user] < currentPhase());
        }
    }

    /* ========== VIEWS ========== */

    function currentPhase() public view returns (uint256) {
        uint256 cumulativeTokens = 0;

        for (uint256 i = 0; i < steps.length; i++) {
            cumulativeTokens += steps[i].size;

            if (totalSold < cumulativeTokens) {
                return i + 1;
            }
        }
        // If totalSold exceeds the total tokens in all steps, return the last step index
        return steps.length - 1 + 1;
    }

    function getGems(address user) public view returns (uint256[] memory) {
        uint256[] memory userGemsArray = new uint256[](gems.length);
        for (uint256 i = 0; i < gems.length; i++) {
            userGemsArray[i] = userGems[user][i];
        }
        return userGemsArray;
    }

    function getCrystals(address user) public view returns (uint256[] memory) {
        uint256[] memory userCrystalsArray = new uint256[](crystals.length);
        for (uint256 i = 0; i < crystals.length; i++) {
            userCrystalsArray[i] = userCrystals[user][i];
        }
        return userCrystalsArray;
    }

   /* ========== ADMIN ========= */

    function setReferralBonusesPercentages(uint256 _referrerCroBonusPercentage,uint256 _referrerIntBonusPercentage,uint256 _referredIntBonusPercentage) external onlyOwner {
        require(_referrerCroBonusPercentage >= 0 && _referrerCroBonusPercentage <= 20, "Value must be between 0 and 20");
        referrerCroBonusPercentage = _referrerCroBonusPercentage;
        require(_referrerIntBonusPercentage >= 0 && _referrerIntBonusPercentage <= 20, "Value must be between 0 and 20");
        referrerIntBonusPercentage = _referrerIntBonusPercentage;
        require(_referredIntBonusPercentage >= 0 && _referredIntBonusPercentage <= 20, "Value must be between 0 and 20");
        referredIntBonusPercentage = _referredIntBonusPercentage;
    }

    function setTotalSold(uint256 _totalSold) external onlyOwner {
        totalSold = _totalSold;
    }

    function setStartDate(uint256 _startDate) external onlyOwner {
        startDate = _startDate;
    }

    function setOnlyWhitelist(bool _onlyAllowWhitelisted) external onlyOwner {
        onlyAllowWhitelisted = _onlyAllowWhitelisted;
    }

    function setPartnersWhitelist(address _partnersWhitelist) external onlyOwner {
        partnersWhitelist = IWhitelist(_partnersWhitelist);
    }

    function setGeneralWhitelist(address _generalWhitelist) external onlyOwner {
        generalWhitelist = IWhitelist(_generalWhitelist);
    }

    function setAdminWhitelist(address _adminWhitelist) external onlyOwner {
        adminWhitelist = IWhitelist(_adminWhitelist);
    }

    function setSteps(Step[] memory _steps) public onlyOwner{
        delete steps; // Clear existing steps
        for (uint256 i = 0; i < _steps.length; i++) {
            steps.push(Step(_steps[i].size, _steps[i].price));
        }
    }

    function addAsset(string memory assetName, uint256 power, uint256 unscaledPrice, bool isCrystal) public onlyOwner {
        if(isCrystal){
            crystals.push(Asset(assetName, power, unscaledPrice));
        }
        else{
            gems.push(Asset(assetName, power, unscaledPrice));
        }
    }

    function updateAsset(uint256 index, uint256 _power, uint256 _unscaledPrice, bool isCrystal) public onlyOwner {
        if (isCrystal) {
            crystals[index].power = _power;
            crystals[index].unscaledPrice = _unscaledPrice;
        } else {
            gems[index].power = _power;
            gems[index].unscaledPrice = _unscaledPrice;
        }
    }

    function reinitializeEnergy(address user) public onlyOwner {
        collectedEnergy[user] = 0;
        generatedEnergy[user] = 0; 
        lastTimeEnergyComputed[user] = block.timestamp;
    }

    receive() external payable {}

    function flush() external onlyOwner{
        payable(owner()).transfer(address(this).balance);
    }

    function giveTokenTo(address user, uint256 amount)  public onlyOwner {
        token.transferFrom(owner(), user, amount * 10**18);
        spendableTokens[user] += amount;
    }

    function giveUnclaimedEarnings(address user, uint256 amount)  public onlyOwner {
        unclaimedEarnings[user] += amount;
        emit EarningsReserve(user, amount);
    }

    /* ========== HELPERS ========== */
    function giveToken(address user, uint256 amount) internal{

        if(firstPurchasePhase[msg.sender] == 0){
            totalUsers += 1;
            firstPurchasePhase[msg.sender] = currentPhase();
        }

        token.transferFrom(owner(), user, amount * 10**18);
        spendableTokens[user] += amount;
    }

    function spendToken(address user, uint256 amount) internal{
        token.transferFrom(user, owner(), amount * 10**18);

        require(spendableTokens[user] >= amount, "Not enough spendable token.");
        spendableTokens[user] -= amount;
    }
}
