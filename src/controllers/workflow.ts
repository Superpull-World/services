import { Request, Response, NextFunction } from 'express';
import { createTemporalClient } from '../services/temporal';
import { v4 as uuidv4 } from 'uuid';
import { workflowRegistry } from '../workflows/registry';
import { loggerService } from '../services/logger';
import { LogContext } from '../services/logger';

interface WorkflowError extends Error {
  workflowName?: string;
  workflowId?: string;
}

interface QueryResults {
  [key: string]: unknown;
}

class WorkflowController {
  findWorkflow = (name: string) => {
    loggerService.debug('Finding workflow in registry', {
      workflowName: name,
    });
    const workflow = workflowRegistry[name as keyof typeof workflowRegistry];

    if (!workflow) {
      loggerService.warn('Workflow not found in registry', {
        workflowName: name,
      });
      return { workflow: null, queries: null, taskQueue: null };
    }

    loggerService.debug('Workflow found in registry', {
      workflowName: name,
      taskQueue: workflow.taskQueue,
    });
    return workflow;
  };

  startWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, args } = req.body;
      const context: LogContext = {
        workflowName: name,
        args: args ? JSON.stringify(args) : undefined,
      };
      loggerService.info('Starting workflow', context);

      if (!name) {
        loggerService.warn('Workflow name not provided in request');
        res.status(400).json({
          message: 'Workflow name is required',
        });
        return;
      }

      const client = await createTemporalClient();
      const id = `${name}-${uuidv4()}`;
      loggerService.debug('Generated workflow ID', {
        workflowId: id,
      });

      const { workflow, taskQueue } = this.findWorkflow(name);
      if (!workflow) {
        loggerService.error('Workflow not found', new Error(), {
          workflowName: name,
        });
        res.status(404).json({
          message: `Workflow ${name} not found in registry`,
        });
        return;
      }

      await client.start(workflow, {
        args: args || [],
        taskQueue: taskQueue!,
        workflowId: id,
      });

      loggerService.info('Workflow started successfully', {
        workflowId: id,
        workflowName: name,
        taskQueue: taskQueue || undefined,
      });

      res.status(200).json({
        message: `Workflow ${name} started`,
        id,
      });
    } catch (err) {
      const error = err as WorkflowError;
      error.workflowName = req.body.name;
      const context: LogContext = {
        workflowName: req.body.name,
        args: req.body.args ? JSON.stringify(req.body.args) : undefined,
      };
      loggerService.error('Error starting workflow', error, context);
      next(error);
    }
  };

  getWorkflowStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = req.query.id as string;
      loggerService.info('Getting workflow status', {
        workflowId: id,
      });

      if (!id) {
        loggerService.warn('Workflow ID not provided in request');
        res.status(400).json({
          message: 'Workflow ID is required',
        });
        return;
      }

      const client = await createTemporalClient();
      const handle = client.getHandle(id);

      const name = id.substring(0, id.indexOf('-'));
      loggerService.info('Extracted workflow name', {
        workflowId: id,
        workflowName: name,
      });

      const { workflow, queries } = this.findWorkflow(name);
      if (!workflow) {
        loggerService.error(
          'Workflow not found for status check',
          new Error(),
          {
            workflowId: id,
            workflowName: name,
          },
        );
        res.status(404).json({
          message: `Workflow ${name} not found in registry`,
        });
        return;
      }
      loggerService.info('Workflow found for status check', {
        workflowId: id,
        workflowName: name,
      });

      const queryResults: QueryResults = {};

      if (queries) {
        loggerService.info('Executing workflow queries', {
          workflowId: id,
          queryCount: Object.keys(queries).length.toString(),
        });

        for (const [queryName, queryFunction] of Object.entries(queries)) {
          try {
            const queryResult = await handle.query(queryFunction);
            queryResults[queryName] = queryResult;
            loggerService.info('Query executed successfully', {
              workflowId: id,
              queryName,
              queryResult: JSON.stringify(queryResult),
            });
          } catch (err) {
            const error = err as WorkflowError;
            error.workflowId = id;
            loggerService.error('Error executing query', error, {
              workflowId: id,
            });
          }
        }
      }

      // const result = await handle.result();
      const status = (await handle.describe()).status;

      loggerService.info('Workflow status retrieved successfully', {
        workflowId: id,
        statusCode: status.code.toString(),
        queryCount: Object.keys(queryResults).length.toString(),
      });

      res.status(200).json({
        message: `Status of workflow ${id}`,
        status,
        queries: queryResults,
      });
    } catch (err) {
      const error = err as WorkflowError;
      error.workflowId = req.query.id as string;
      const context: LogContext = {
        workflowId: (req.query.id as string) || undefined,
      };
      loggerService.error('Error getting workflow status', error, context);
      next(error);
    }
  };

  sendWorkflowSignal = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { workflowId, name, args } = req.body;
      const context: LogContext = {
        workflowId,
        signalName: name,
        args: args ? JSON.stringify(args) : undefined,
      };
      loggerService.info('Sending workflow signal', context);

      if (!workflowId || !name) {
        loggerService.warn('Missing required parameters', context);
        res.status(400).json({
          message: 'workflowId and signalName are required',
        });
        return;
      }

      const client = await createTemporalClient();
      const handle = client.getHandle(workflowId);
      await handle.signal(name, args);

      loggerService.info('Signal sent successfully', context);
      res.status(200).json({
        message: `Signal ${name} sent to workflow ${workflowId}`,
      });
    } catch (err) {
      const error = err as WorkflowError;
      error.workflowId = req.body.workflowId;
      const context: LogContext = {
        workflowId: req.body.workflowId,
        signalName: req.body.name,
        args: req.body.args ? JSON.stringify(req.body.args) : undefined,
      };
      loggerService.error('Error sending workflow signal', error, context);
      next(error);
    }
  };
}

export default new WorkflowController();
