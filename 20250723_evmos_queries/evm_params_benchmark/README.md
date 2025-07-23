This repository contains a helper script
to evaluate the performance
of querying the EVM parameters
of an Evmos node.

1. Check out the Evmos commit that should be tested

```
git checkout v11.0.0-rc1
```

2. Start a local node

```
./local_node.sh
```

3. Execute the timer script

```
cd /path/to/script
./query_evm_params.py
```

