# @wirelab/rig

The bug-class rig of wirelab. Each finding of the catalog is an instance of a bug class. A probe of the class finds the same fault again, and each permutation of it, in each package of the formats of the class. `docs/W26-RIG.md` gives the design.

## The parts

| Part | File | What it does |
| --- | --- | --- |
| The adapter of format 1 | `src/cuts.ts` | It cuts a valid stream of length-prefixed frames at one point inside one frame. |
| The outcomes and the oracles | `src/outcome.ts` | It records the outcome of one call: a value, an error or a timeout. An oracle gives a verdict for each outcome. |
| The matrix | `src/matrix.ts` | It reads the dimensions of a class from the catalog and makes the rows of the matrix. |
| The targets | `src/targets/` | A target is one client of one package at one version. It gives a valid stream and the outcome of a call on bytes. |
| The probes | `src/probes/` | A probe examines each row of the matrix of its class on each target. |

## The probe C017

C017 is the class "a stream cut inside a length prefix or a header ends with no error". The probe cuts a valid stream at each place and each cut of the catalog. The oracle `errorOnCut` gives these verdicts:

- An error is a pass.
- A value is a fail.
- A timeout is inconclusive, because a hang is the class C007.

The targets are three calls of `@connectrpc/connect-web` 2.3.0: a Connect server stream, a gRPC-web server stream and a gRPC-web unary call. The scripted server of `@mark1russell7/rigor-testkit` sends each cut stream as the body of one response.

The target of `apache-arrow` 21.2.0 is `tableFromIPC` on an Arrow IPC stream of one schema and two record batches. Each message is one frame with a prefix of 8 bytes.

The target of `@aws-sdk/client-s3` 3.1175.0 is the event stream of `SelectObjectContentCommand`, with `@smithy/core` 3.41.0. A local request handler gives the bytes. Each event message is one frame with a prefix of 4 bytes: its total length.

## The arms

A proven probe passes on the fixed version of each instance. When no fixed version is released, an arm builds the package from a commit. `src/arms.json` gives each arm: the repository, its base commit, the fix, the build command and the folders to copy. The fix is a commit, or a patch in the folder `arms` when no fix commit is public.

- The arm `base` builds the base commit. The probe must find the fault again. Thus the build alone does not change the result.
- The arm `fixed` builds the commit of the fix. The probe must find no fault.
- The workflow `rig-arms.yml` starts each arm in its own job, only for a pull request. The job puts the build in place of each installed release of the package.

## The checks

- `pnpm test` examines the adapter, and compares its values with the dimensions of the catalog.
- The probes start only when the environment variable `RIG` is `1`. The workflow `rig.yml` sets it, and writes the report of each probe to an artifact.
