const doc = { documentElement: { style: { setProperty() {} }, dataset: {} } };
Object.assign(globalThis, { document: doc });
