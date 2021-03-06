# LBRY Claimtrie

This document describes the implementation detail of the ClaimTrie in LBRY. The ClaimTrie is the data structure which LBRY uses to store claims to names. It uses a [Trie](https://en.wikipedia.org/wiki/Trie) to efficiently store all claimed names, which can then be hashed the same way a [Merkle Tree](https://en.wikipedia.org/wiki/Merkle_tree) is hashed. The root hash of the ClaimTrie is stored in the blockheader of each LBRY block, enabling nodes in the LBRY network to efficiently and securely validate the state of the ClaimTrie.

Bids to claim a name must win out against other claims for the same name before they can be inserted into the ClaimTrie. The short summary is that the bid with the most LBRY credits assigned to it will win the right to claim a name, but the implementation detail is more involved and, this is what we aim to cover in this document. Bids to claim a name have four properties tied to it :

1. *Name* : The name is a human-readable address and is the property that the bids compete to obtain.
2. *Value* : The value is the data that is attached to the name.
3. *Quantity* : The quantity is the number of LBRY credits assigned to the bid.
4. *Claim Id* : A unique ID used to identify the bid.

There are also three different bid types: claim, update, and support.

1. *Claim*: A claim represent new bids for a name. If a user wants to make a claim to a brand new name, or submit a competing claim to an existing name, this bid type is used.
2. *Support*: A support adds to the total quantity of credits assigned to any bid by referring to a bid's Claim Id. A support bid can be made by anyone on any bid. It does not have its own Value or its own Claim Id, but it does contain the Claim Id of the bid that it is supporting.
3. *Update*: An update can modify the value and the quantity for a pre-existing claim without changing the Claim Id or the name that it is bidding on. Since the Claim Id of the original bid is not changed, an updated bid will still retain all the supports attached to the original bid.


## ClaimTrie Bid States

This section describes how bids are processed by the ClaimTrie in order to determine which bids have won the rights to claim a particular name.  There are 6 states a bid can be in, and they are explained below.

1. *Not accepted*: This bid is in a transaction which has not yet been included in a block which has been included in the blockchain.
2. *Accepted*: This bid has been accepted into the blockchain. This happens when the transaction containing the TXout which contains the bid is included in a block which is included in the blockchain.
3. *Active*: This bid is capable of controlling a name. Active bids must be in the "accepted" state and not "expired" or "spent". Bids are "active" when either of the two conditions below is met:
  * The current block height exceeds the height of the block at which the bid became accepted plus the activation delay for the name as calculated at either the block at which the bid was accepted or any block after the bid was accepted. The activation delay is calculated as follows:
    * If, immediately before this block was included in the blockchain, there were no 'active' bids for the name and therefore no 'controlling' bids, the delay is 0.
    * If there is a "controlling" bid for the name: Delay = (HeightB - HeightA) / 32
      * HeightA = the most recent height at which the bid controlling the name changed
      * HeightB = the current height
      * Maximum delay is 7 days of blocks at 2.5 min/block (or 4032 blocks). Thus maximum delay can be reached in 224 (7x32) days.
  * The bid's Claim Id matches the Claim Id of the bid which was the controlling bid immediately before the block containing this bid was included in the blockchain. In other words, it is either an update to the previous controlling bid or update to update to the previous controlling bid if the bid was updated twice in this block, etc.
4. *Controlling*: This bid currently controls the name. When clients ask which bid controls the name as of the current block, this is the bid that will be returned. Must be in the "active" state and only one bid for any name may be in this state. A support cannot be in the "controlling" state. To determine which "active" bid is the "controlling" bid for each name:
    * Add the quantity of each 'active' bid to the quantity of all 'active' supports for that bid, and take whichever is greatest. If two bids have the same quantity, older bids take precedence over newer bids.
    * If the bid with the greatest amount does not have the same claimID as the bid which was 'controlling' prior to including the current block, change the delay for the name as of the current block to 0, redetermine which bids and supports should be active, and then perform the previous calculation again.
    * At this point, the bid calculated to have the greatest amount behind it is the 'controlling' bid as of this block
5. *Spent*: A transaction has been included in the blockchain which spends the TXout which contains the bid. Must be in the 'accepted' state.
6. *Expired*: All bids 'expire' regardless of what state they are in when the current block height exceeds the height of the block at which the bid was accepted plus 2102400 blocks, or 3650 days or 10 years considering a 2.5 minute block time. (Prior to block 400155 this was set to 262974 blocks, or 456 days, which was changed with a [hardfork](https://github.com/lbryio/lbrycrd/pull/137). Updated claims will restart the expiration timer at the block height of the update.


## ClaimTrie Transaction Implementation

This section describes how the three ClaimTrie bid types are implemented as transactions on the blockchain. Readers should have prior knowledge of Bitcoin [transactions](https://en.bitcoin.it/wiki/Transaction) and the Bitcoin [scripting system](https://en.bitcoin.it/wiki/Script).  LBRY supports three op codes that do not exist in Bitcoin: OP_CLAIM_NAME, OP_SUPPORT_CLAIM, and OP_UPDATE_CLAIM (in Bitcoin they are respectively OP_NOP6, OP_NOP7, and OP_NOP8). Each op code will push a zero on to the execution stack, and in addition, will trigger the ClaimTrie to perform calculations necessary for each bid type. Below are the three supported transactions scripts using these op codes.

```python
OP_CLAIM_NAME <Name> <Value> OP_2DROP OP_DROP [script pubkey]
OP_UPDATE_CLAIM <Name> <ClaimId> <Value> OP_2DROP OP_2DROP [script pubkey]
OP_SUPPORT_CLAIM <Name> <ClaimId> OP_2DROP OP_DROP [script pubkey]
```
[script pubkey] can be any valid Bitcoin payout script, thus it can be something like a standard "pay to pubkey" script to a user controlled address. Also note that the zero pushed onto the stack by the ClaimTrie op codes, and the ClaimTrie vectors, are all dropped by the preceding OP_2DROP and OP_DROP. This means that ClaimTrie transactions exist as prefixes to Bitcoin payout scripts and can be spent in the same way as is expected in Bitcoin.

For example, a claim transaction using a pay to pubkey script will have the below full payout script. Let's also say that this claim is for the name "Fruit" to be set to value "Apple".

```python
OP_CLAIM_NAME <Fruit> <Apple> OP_2DROP OP_DROP OP_DUP OP_HASH160 <LBRY_Address_A> OP_EQUALVERIFY OP_CHECKSIG
```

Like any standard Bitcoin transaction output script, it will be associated with a transaction hash and a transaction output index. The transaction hash and transaction output index is concatenated and hashed using RIPEMD-160 to create the Claim Id for this claim. For the example above, let's say it has a Claim Id X. A support for this bid will have the below full payout script.

```python
OP_SUPPORT_CLAIM <Fruit> <X> OP_2DROP OP_DROP OP_DUP OP_HASH160 <LBRY_Address_B> OP_EQUALVERIFY OP_CHECKSIG
```

And now let's say we want to update the original claim to change the value to "Banana". An update transaction has a special requirement that it must spend the existing claim that it wishes to update in its redeem script. Otherwise, it will be considered invalid and will not make it into the ClaimTrie. Thus it will have the below redeem script to spend the claim created to set name "Fruit" to "Apple". Note that this is identical to the standard way of redeeming a "pay to pubkey" script in Bitcoin.

```python
<Signature> <Public_key_for_LBRY_Address_A>
```

And the payout script for the update transaction is below.

```python
OP_UPDATE_CLAIM <Fruit> <X> <Banana> OP_2DROP OP_2DROP OP_DUP OP_HASH160 <LBRY_Address_C> OP_EQUALVERIFY OP_CHECKSIG
```
