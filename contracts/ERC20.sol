// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract MyPausableToken is ERC20, Ownable, Pausable {
    address public specialAddress;

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) Ownable(msg.sender){
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Set the special address that can use transferFrom without an allowance
     * @param _specialAddress The address to set as the special address
     */
    function setSpecialAddress(address _specialAddress) external onlyOwner {
        specialAddress = _specialAddress;
    }

    /**
     * @notice Pauses all token transfers. Can only be called by the owner.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses all token transfers. Can only be called by the owner.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

/**
     * @notice Override transfer to ensure it respects the pause state, except for specialAddress.
     * @param to The address to send tokens to
     * @param amount The amount of tokens to send
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        // Allow transfers if contract is not paused, or if msg.sender is the special address
        require(!paused() || msg.sender == specialAddress || msg.sender == owner(), "Token transfers are paused");
        return super.transfer(to, amount);
    }

    /**
     * @notice Override transferFrom to allow specialAddress to bypass allowance and pause checks.
     * @param from The address to send tokens from
     * @param to The address to send tokens to
     * @param amount The amount of tokens to send
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (msg.sender == specialAddress || msg.sender == owner()) {
            _transfer(from, to, amount);
            return true;
        } else {
            require(!paused(), "Token transfers are paused");
            return super.transferFrom(from, to, amount);
        }
    }

    /**
     * @notice Overrides renounceOwnership to set specialAddress to address(0) when ownership is renounced
     */
    function renounceOwnership() public override onlyOwner {
        specialAddress = address(0);
        super.renounceOwnership();
    }
}
