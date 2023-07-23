# ICP RAISE FUNDS

## Testing on local network

To deploy run

    sh```
    dfx deploy
    ```

- After deploying the canister, run the `initialize` function, this sets the canister parameters and sets the payload network to `0` for local network and `1` for mainnet. If set to local network it initiliazes the dummy tokens which can then be used to test the canister.
- Next run the `getFaucetTokens` function to get the dummy tokens to your account.
- Then you can proceed to testing the features of the canister.
