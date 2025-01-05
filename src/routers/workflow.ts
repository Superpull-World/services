import express from 'express';
import WorkflowController from '../controllers/workflow';

const workflowRouter = express.Router();

workflowRouter.post('/start', WorkflowController.startWorkflow);
workflowRouter.get('/query', WorkflowController.getWorkflowStatus);
workflowRouter.post('/signal', WorkflowController.sendWorkflowSignal);

export default workflowRouter;
