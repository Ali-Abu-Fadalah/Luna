// Public edition: account-connected draft transports are not distributed.
globalThis.LunaAuctionAPI = Object.freeze(
  Object.fromEntries(
    ["identity", "preflight", "save", "receipts"].map((operation) => [
      operation,
      async () => {
        const error = new Error(
          "Account-connected auction filling is not included in the public edition."
        );
        error.code = "unsupported";
        throw error;
      }
    ])
  )
);
