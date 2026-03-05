#!/usr/bin/env node

import { createCLI } from '@backtester/cli/cli';

const program = createCLI();

program.parse(process.argv);
