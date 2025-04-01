// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title Governance
 * @dev 實現平台治理機制，包括提案、投票和執行
 */
contract Governance is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;

    // 角色定義
    bytes32 public constant PLATFORM_ROLE = keccak256("PLATFORM_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    
    // 提案狀態
    enum ProposalState {
        Pending,      // 待處理
        Active,       // 活躍中
        Passed,       // 已通過
        Rejected,     // 已拒絕
        Executed,     // 已執行
        Cancelled     // 已取消
    }
    
    // 提案類型
    enum ProposalType {
        ParameterChange,     // 參數更改
        FeeAdjustment,       // 費用調整
        ProtocolUpgrade,     // 協議升級
        FundAllocation,      // 資金分配
        DisputeResolution,   // 爭議解決
        Other                // 其他
    }
    
    // 投票選項
    enum VoteOption {
        None,       // 未投票
        For,        // 贊成
        Against,    // 反對
        Abstain     // 棄權
    }
    
    // 提案結構
    struct Proposal {
        uint256 id;                   // 提案ID
        address proposer;             // 提案人
        string title;                 // 標題
        string description;           // 描述
        ProposalType proposalType;    // 提案類型
        bytes callData;               // 調用數據
        address target;               // 目標合約
        uint256 valueAmount;          // 價值數量
        uint256 startTime;            // 開始時間
        uint256 endTime;              // 結束時間
        uint256 forVotes;             // 贊成票
        uint256 againstVotes;         // 反對票
        uint256 abstainVotes;         // 棄權票
        bool executed;                // 是否已執行
        bool cancelled;               // 是否已取消
        mapping(address => VoteOption) votes; // 投票記錄
        mapping(address => uint256) voteWeight; // 投票權重
    }
    
    // 成員結構
    struct Member {
        bool isActive;                // 是否活躍
        uint256 tokenBalance;         // 代幣餘額 (投票權)
        uint256 reputationScore;      // 信譽評分
        uint256 joinedAt;             // 加入時間
        uint256 proposalsCreated;     // 創建的提案數
        uint256 votesParticipated;    // 參與的投票數
    }
    
    // 常數
    uint256 public constant BASIS_POINTS = 10000; // 基點 (100.00%)
    uint256 public constant MINIMUM_VOTING_PERIOD = 3 days; // 最短投票期
    uint256 public constant MAXIMUM_VOTING_PERIOD = 14 days; // 最長投票期
    
    // 治理參數
    uint256 public quorumThreshold = 2000;  // 法定人數閾值 (20.00%)
    uint256 public executionDelay = 2 days; // 執行延遲
    uint256 public proposalThreshold = 500; // 提案門檻 (5.00%)
    uint256 public minVotingDuration = 3 days; // 最小投票持續時間
    
    // 狀態變數
    Counters.Counter private _proposalIds;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => Member) public members;
    address public governanceToken;
    address public treasury;
    uint256 public totalVotingPower;
    address[] public memberList;
    
    // 事件
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string title, ProposalType proposalType);
    event VoteCast(uint256 indexed proposalId, address indexed voter, VoteOption voteOption, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);
    event GovernanceParameterChanged(string paramName, uint256 oldValue, uint256 newValue);
    
    /**
     * @dev 初始化合約
     * @param _governanceToken 治理代幣地址
     * @param _treasury 國庫地址
     */
    constructor(address _governanceToken, address _treasury) {
        require(_governanceToken != address(0), "Invalid governance token address");
        require(_treasury != address(0), "Invalid treasury address");
        
        governanceToken = _governanceToken;
        treasury = _treasury;
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(PLATFORM_ROLE, msg.sender);
        
        // 添加平台創建者為初始成員
        _addMember(msg.sender, 1000 * 10**18); // 初始分配1000代幣投票權
    }
    
    /**
     * @dev 更新治理參數
     * @param _paramName 參數名稱
     * @param _newValue 新值
     */
    function updateGovernanceParameter(string memory _paramName, uint256 _newValue) external onlyRole(PLATFORM_ROLE) {
        bytes32 paramHash = keccak256(abi.encodePacked(_paramName));
        
        if (paramHash == keccak256(abi.encodePacked("quorumThreshold"))) {
            require(_newValue <= 5000, "Quorum too high"); // 最高50%
            uint256 oldValue = quorumThreshold;
            quorumThreshold = _newValue;
            emit GovernanceParameterChanged("quorumThreshold", oldValue, _newValue);
        } else if (paramHash == keccak256(abi.encodePacked("executionDelay"))) {
            require(_newValue <= 14 days, "Delay too long"); // 最長14天
            uint256 oldValue = executionDelay;
            executionDelay = _newValue;
            emit GovernanceParameterChanged("executionDelay", oldValue, _newValue);
        } else if (paramHash == keccak256(abi.encodePacked("proposalThreshold"))) {
            require(_newValue <= 1000, "Threshold too high"); // 最高10%
            uint256 oldValue = proposalThreshold;
            proposalThreshold = _newValue;
            emit GovernanceParameterChanged("proposalThreshold", oldValue, _newValue);
        } else if (paramHash == keccak256(abi.encodePacked("minVotingDuration"))) {
            require(_newValue >= MINIMUM_VOTING_PERIOD && _newValue <= MAXIMUM_VOTING_PERIOD, "Invalid duration");
            uint256 oldValue = minVotingDuration;
            minVotingDuration = _newValue;
            emit GovernanceParameterChanged("minVotingDuration", oldValue, _newValue);
        } else {
            revert("Invalid parameter name");
        }
    }
    
    /**
     * @dev 添加成員
     * @param _member 成員地址
     * @param _initialTokens 初始代幣數量
     */
    function addMember(address _member, uint256 _initialTokens) external onlyRole(PLATFORM_ROLE) {
        _addMember(_member, _initialTokens);
    }
    
    /**
     * @dev 內部方法：添加成員
     * @param _member 成員地址
     * @param _initialTokens 初始代幣數量
     */
    function _addMember(address _member, uint256 _initialTokens) internal {
        require(_member != address(0), "Invalid member address");
        require(!members[_member].isActive, "Member already exists");
        
        members[_member] = Member({
            isActive: true,
            tokenBalance: _initialTokens,
            reputationScore: 100, // 初始信譽分
            joinedAt: block.timestamp,
            proposalsCreated: 0,
            votesParticipated: 0
        });
        
        memberList.push(_member);
        totalVotingPower += _initialTokens;
        
        emit MemberAdded(_member);
    }
    
    /**
     * @dev 移除成員
     * @param _member 成員地址
     */
    function removeMember(address _member) external onlyRole(PLATFORM_ROLE) {
        require(members[_member].isActive, "Member not active");
        
        totalVotingPower -= members[_member].tokenBalance;
        members[_member].isActive = false;
        
        emit MemberRemoved(_member);
    }
    
    /**
     * @dev 更新成員代幣餘額
     * @param _member 成員地址
     * @param _newBalance 新餘額
     */
    function updateMemberTokenBalance(address _member, uint256 _newBalance) external onlyRole(PLATFORM_ROLE) {
        require(members[_member].isActive, "Member not active");
        
        totalVotingPower = totalVotingPower - members[_member].tokenBalance + _newBalance;
        members[_member].tokenBalance = _newBalance;
    }
    
    /**
     * @dev 創建提案
     * @param _title 標題
     * @param _description 描述
     * @param _proposalType 提案類型
     * @param _callData 調用數據
     * @param _target 目標合約
     * @param _valueAmount 價值數量
     * @param _votingPeriod 投票期
     */
    function createProposal(
        string memory _title,
        string memory _description,
        ProposalType _proposalType,
        bytes memory _callData,
        address _target,
        uint256 _valueAmount,
        uint256 _votingPeriod
    ) external nonReentrant {
        require(members[msg.sender].isActive, "Not an active member");
        require(_votingPeriod >= minVotingDuration && _votingPeriod <= MAXIMUM_VOTING_PERIOD, "Invalid voting period");
        
        // 檢查提案人是否有足夠代幣達到提案門檻
        uint256 requiredTokens = (totalVotingPower * proposalThreshold) / BASIS_POINTS;
        require(members[msg.sender].tokenBalance >= requiredTokens, "Insufficient tokens for proposal");
        
        // 增加提案ID
        _proposalIds.increment();
        uint256 proposalId = _proposalIds.current();
        
        // 創建提案
        Proposal storage newProposal = proposals[proposalId];
        newProposal.id = proposalId;
        newProposal.proposer = msg.sender;
        newProposal.title = _title;
        newProposal.description = _description;
        newProposal.proposalType = _proposalType;
        newProposal.callData = _callData;
        newProposal.target = _target;
        newProposal.valueAmount = _valueAmount;
        newProposal.startTime = block.timestamp;
        newProposal.endTime = block.timestamp + _votingPeriod;
        newProposal.forVotes = 0;
        newProposal.againstVotes = 0;
        newProposal.abstainVotes = 0;
        newProposal.executed = false;
        newProposal.cancelled = false;
        
        // 更新提案人統計
        members[msg.sender].proposalsCreated++;
        
        emit ProposalCreated(proposalId, msg.sender, _title, _proposalType);
    }
    
    /**
     * @dev 投票
     * @param _proposalId 提案ID
     * @param _voteOption 投票選項
     */
    function castVote(uint256 _proposalId, VoteOption _voteOption) external nonReentrant {
        require(members[msg.sender].isActive, "Not an active member");
        require(_voteOption > VoteOption.None, "Invalid vote option");
        
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.id == _proposalId, "Proposal does not exist");
        require(block.timestamp >= proposal.startTime, "Voting not started");
        require(block.timestamp < proposal.endTime, "Voting ended");
        require(!proposal.cancelled, "Proposal cancelled");
        require(proposal.votes[msg.sender] == VoteOption.None, "Already voted");
        
        uint256 weight = members[msg.sender].tokenBalance;
        
        // 記錄投票
        proposal.votes[msg.sender] = _voteOption;
        proposal.voteWeight[msg.sender] = weight;
        
        // 更新投票計數
        if (_voteOption == VoteOption.For) {
            proposal.forVotes += weight;
        } else if (_voteOption == VoteOption.Against) {
            proposal.againstVotes += weight;
        } else {
            proposal.abstainVotes += weight;
        }
        
        // 更新投票人統計
        members[msg.sender].votesParticipated++;
        
        emit VoteCast(_proposalId, msg.sender, _voteOption, weight);
    }
    
    /**
     * @dev 執行提案
     * @param _proposalId 提案ID
     */
    function executeProposal(uint256 _proposalId) external nonReentrant {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.id == _proposalId, "Proposal does not exist");
        require(!proposal.executed, "Proposal already executed");
        require(!proposal.cancelled, "Proposal cancelled");
        require(block.timestamp >= proposal.endTime, "Voting not ended");
        require(block.timestamp >= proposal.endTime + executionDelay, "Execution delay not passed");
        
        // 檢查是否達到法定人數
        uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        require(totalVotes * BASIS_POINTS / totalVotingPower >= quorumThreshold, "Quorum not reached");
        
        // 檢查是否通過
        require(proposal.forVotes > proposal.againstVotes, "Proposal rejected");
        
        // 標記為已執行
        proposal.executed = true;
        
        // 執行調用
        (bool success, ) = proposal.target.call{value: proposal.valueAmount}(proposal.callData);
        require(success, "Proposal execution failed");
        
        emit ProposalExecuted(_proposalId);
    }
    
    /**
     * @dev 取消提案
     * @param _proposalId 提案ID
     */
    function cancelProposal(uint256 _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.id == _proposalId, "Proposal does not exist");
        require(!proposal.executed, "Proposal already executed");
        require(!proposal.cancelled, "Proposal already cancelled");
        require(proposal.proposer == msg.sender || hasRole(PLATFORM_ROLE, msg.sender), "Not authorized");
        
        proposal.cancelled = true;
        
        emit ProposalCancelled(_proposalId);
    }
    
    /**
     * @dev 獲取提案狀態
     * @param _proposalId 提案ID
     * @return 提案狀態
     */
    function getProposalState(uint256 _proposalId) public view returns (ProposalState) {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.id == _proposalId, "Proposal does not exist");
        
        if (proposal.cancelled) {
            return ProposalState.Cancelled;
        } else if (proposal.executed) {
            return ProposalState.Executed;
        } else if (block.timestamp < proposal.startTime) {
            return ProposalState.Pending;
        } else if (block.timestamp < proposal.endTime) {
            return ProposalState.Active;
        } else {
            // 投票已結束，檢查結果
            // 檢查是否達到法定人數
            uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
            if (totalVotes * BASIS_POINTS / totalVotingPower < quorumThreshold) {
                return ProposalState.Rejected; // 未達到法定人數
            }
            
            // 檢查投票結果
            return proposal.forVotes > proposal.againstVotes ? ProposalState.Passed : ProposalState.Rejected;
        }
    }
    
    /**
     * @dev 獲取提案詳情
     * @param _proposalId 提案ID
     * @return title 標題
     * @return description 描述
     * @return proposalType 提案類型
     * @return proposer 提案人
     * @return startTime 開始時間
     * @return endTime 結束時間
     * @return forVotes 贊成票
     * @return againstVotes 反對票
     * @return abstainVotes 棄權票
     * @return executed 是否已執行
     * @return cancelled 是否已取消
     */
    function getProposalDetails(uint256 _proposalId) external view returns (
        string memory title,
        string memory description,
        ProposalType proposalType,
        address proposer,
        uint256 startTime,
        uint256 endTime,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        bool executed,
        bool cancelled
    ) {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.id == _proposalId, "Proposal does not exist");
        
        return (
            proposal.title,
            proposal.description,
            proposal.proposalType,
            proposal.proposer,
            proposal.startTime,
            proposal.endTime,
            proposal.forVotes,
            proposal.againstVotes,
            proposal.abstainVotes,
            proposal.executed,
            proposal.cancelled
        );
    }
    
    /**
     * @dev 查詢成員投票狀態
     * @param _proposalId 提案ID
     * @param _member 成員地址
     * @return voteOption 投票選項
     * @return weight 投票權重
     */
    function getMemberVote(uint256 _proposalId, address _member) external view returns (VoteOption voteOption, uint256 weight) {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.id == _proposalId, "Proposal does not exist");
        
        return (proposal.votes[_member], proposal.voteWeight[_member]);
    }
    
    /**
     * @dev 獲取成員詳情
     * @param _member 成員地址
     * @return isActive 是否活躍
     * @return tokenBalance 代幣餘額
     * @return reputationScore 信譽評分
     * @return joinedAt 加入時間
     * @return proposalsCreated 創建的提案數
     * @return votesParticipated 參與的投票數
     */
    function getMemberDetails(address _member) external view returns (
        bool isActive,
        uint256 tokenBalance,
        uint256 reputationScore,
        uint256 joinedAt,
        uint256 proposalsCreated,
        uint256 votesParticipated
    ) {
        Member storage member = members[_member];
        
        return (
            member.isActive,
            member.tokenBalance,
            member.reputationScore,
            member.joinedAt,
            member.proposalsCreated,
            member.votesParticipated
        );
    }
    
    /**
     * @dev 更新成員信譽評分
     * @param _member 成員地址
     * @param _newScore 新評分
     */
    function updateReputationScore(address _member, uint256 _newScore) external onlyRole(PLATFORM_ROLE) {
        require(members[_member].isActive, "Member not active");
        require(_newScore <= 100, "Score out of range"); // 評分範圍0-100
        
        members[_member].reputationScore = _newScore;
    }
    
    /**
     * @dev 獲取活躍成員數量
     * @return 活躍成員數量
     */
    function getActiveMembersCount() external view returns (uint256) {
        uint256 count = 0;
        
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].isActive) {
                count++;
            }
        }
        
        return count;
    }
    
    /**
     * @dev 批量獲取提案IDs
     * @param _startIndex 起始索引
     * @param _count 數量
     * @return 提案ID數組
     */
    function getProposalIds(uint256 _startIndex, uint256 _count) external view returns (uint256[] memory) {
        uint256 totalProposals = _proposalIds.current();
        
        if (_startIndex >= totalProposals) {
            return new uint256[](0);
        }
        
        uint256 endIndex = _startIndex + _count;
        if (endIndex > totalProposals) {
            endIndex = totalProposals;
        }
        
        uint256[] memory result = new uint256[](endIndex - _startIndex);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = _startIndex + i + 1; // 提案ID從1開始
        }
        
        return result;
    }
    
    /**
     * @dev 獲取總投票權
     * @return 總投票權
     */
    function getTotalVotingPower() external view returns (uint256) {
        return totalVotingPower;
    }
    
    /**
     * @dev 接收 ETH
     */
    receive() external payable {}
    
    /**
     * @dev 緊急治理操作 (僅平台管理員可調用)
     * @param _target 目標合約
     * @param _data 調用數據
     * @param _value 價值數量
     */
    function emergencyExecute(address _target, bytes memory _data, uint256 _value) external onlyRole(PLATFORM_ROLE) returns (bool, bytes memory) {
        return _target.call{value: _value}(_data);
    }
}