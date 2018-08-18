## Synopsis

The Arbitrable Permission List is an arbitrator curated registry. Anyone can submit an item with a deposit. If no one challenges the submission within a defined time period, the item is added to the registry.

Anyone can challenge and also post a deposit. If someone does, a dispute is created. The winner of the dispute gets the deposit of the other party and the item is added or cleared accordingly.

To make a request, parties have to deposit a stake and the arbitration fees. If the arbitration fees change between the submitter's payment and the challenger's payment, a part of the submitter stake can be used as an arbitration fee deposit.

## Processes
Items are represented by `bytes32`. The user calls `requestRegistration` to submit an item. If a defined time period passes and there is no dispute (no `challengeRegistration` aginst the item), the user calls `executeRequest` to add the item into the registry. However, if during that time period someone calls `challengeRegistration`, a designated abitrator contract is called upon to resolve the dispute. Eventually the abitrator will call back with its ruling: If the ruling is the item belongs to the list, the item is added. If not, the item is cleared. If the arbitrator refuses to rule, the item reverts to absent state just as it has not been submitted.

One could always request to re-add a cleared item by calling `requestRegistration` and the ensuing process is similar to the process described above for adding fresh item, the only difference being that the item reverts back to "cleared" state if the abitrator refuses to rule.

Unless the list is append-only, one could request to clear a registered item by calling `requestClearing`. Again, the process is similar, except anyone opposing should call `challengeClearing` instead of `challengeRegistration`. If the abitrator refuses to rule, the item remains registered.

Also, if not append-only, the list allows anyone to preemptively clear an item not registered before by calling `requestClearing`. The process is also familiar: if a defined time period passes without dispute (by `challengeClearing`), the item could be cleared by calling `executeRequst`. Otherwise the arbitrator rules.

There is a flag `rechallengePossible`, when true, that could change the submission process slightly. When an item is submitted (by `requestRegistration`) and then challenged (by `challengeRegistration`), and the arbitrator rules in favor of the submitter, the item is not directly registered as described above. Instead the effect of the ruling is as if there has been no challenge at all, meaning the submitter, in order to get the item registered, still has to wait through the challenge period without any challenge occuring and then call `executeRequest`. And of course, if a challenge does occur and succeeds (the arbitrator rules that the item be cleared), the item is cleared. In other words, if the `rechallengePossible` flag is set, the only way the submitter registers an item is to wait through the period unchallenged. The flag only applies in this situation and does not have effect anywhere else.

During disputation, anyone can appeal current ruling by calling `appeal`.

The state of an item could be queried by `isPermitted`. If the list is a whitelist, an item is permitted if it is just submitted, registered (even if under request for clearing, as long as the request hasn't concluded) or requested for preemptive clearing but under dispute(challenged); it is not permitted if it is absent, cleared (even if under request for re-registeration) or being preemptively cleared with no outstanding challenge. For blacklist, it is the opposite.

## Methods Summary
### `requestRegistration`
Called to request to register an item. Precondition: the item is absent or cleared. If no challenge is raised in a time period, the requester could call `executeRequest` to execute the request. If someone challenges the request with `challengeRegistration`, a dispute is created and the state of the item will be ruled by arbitrator.

### `requestClearing`
Called to request to clear an item. Preconditon: the list is not append-only and the item is absent (this is "preemptive clearing") or registerd. If no challenge is raised in a time period, the requester could call `executeRequest` to excute the request. If someone challenges the request with `challengeClearing`, a dispute is created and the state of the item will be ruled by arbitrator.

### `excuteRequest`
Called to excuted a previous request to register (by `reqeustRegistration`) or clear (by `requestClearing`) an item after the challenge time has passed and no challenge is raised during that period.

### `challengeRegistration`
Called to challenge a registration request. Precondition: the item has been submitted for registration (by `requestRegistration`), the request hasn't been executed, and there is no outstanding dispute (no concurrent challenges allowed). A dispute is created and the arbitrator will rule and eventually deliver the ruling by calling this list contract back.

### `challengeClearing`
Called to challenge a clearing request. Precondition: the item has been submitted for clearing (by `requestClearing`), the request hasn't been executed, and there is no outstanding dispute (no concurrent challenges allowed). A dispute is created and the arbitrator will rule and eventually deliver the ruling by calling this list contract back.

## Fees

To make a request (for clearing or registration), a user has to deposit a stake and the arbitration fees. If the request goes unchallenged (no `challengeRegistration` or `challengeClearing` during challenge period), the user is refunded. Anyone to challenge must also pay the stake plus arbitration fee. Winner of the abitration is awarded the remaining balance of the disputed item, which includes both parts' deposits minus the arbitration cost. In case the arbitrator refuses to rule, the balance is split equally between parties. If the arbitration fees change between the submitter's payment and the challenger's payment, a part of the submitter stake can be used as an arbitration fee deposit.
 





