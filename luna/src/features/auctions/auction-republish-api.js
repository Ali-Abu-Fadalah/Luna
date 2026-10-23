// Public edition: authenticated admin connections are not distributed.
globalThis.LunaAuctionRepublishAPI = Object.freeze(
  Object.fromEntries(
    ["connect", "call", "link"].map((operation) => [
      operation,
      async () => {
        const error = new Error(
          "Account-connected auction republishing is not included in the public edition."
        );
        error.code = "unsupported";
        throw error;
      }
    ])
  )
);
