import { DescribeEvent, RegisteredEvent } from '../interfaces/RegisterEvent';
import { Events } from '../interfaces/Events';
import * as Joi from 'joi';
import 'joi-extract-type';
import { CheckAssertionsResult } from '../interfaces/ApiCheck';

// Sent whenever an API is created
const ApiCreatedSchema = Joi.object({ apiName: Joi.string().required() });

// @ts-ignore
type ApiCreatedProperties = Joi.extractType<typeof ApiCreatedSchema>;
export const ApiCreated = DescribeEvent<ApiCreatedProperties>(
  Events.ApiCreated,
  ApiCreatedSchema,
  (props) => `An API called ${props.apiName} was created`
);

const UserLoggedInFromCLISchema = Joi.object({
  userId: Joi.string().required(),
});
// @ts-ignore
type UserLoggedInFromCLIProperties = Joi.extractType<
  typeof UserLoggedInFromCLISchema
>;
export const UserLoggedInFromCLI = DescribeEvent<UserLoggedInFromCLIProperties>(
  Events.UserLoggedInFromCLI,
  UserLoggedInFromCLISchema,
  (props) => `User ${props.userId} logged in`
);

const ApiInitializedInProjectSchema = Joi.object({
  apiName: Joi.string().required(),
  source: Joi.string().required(),
  cwd: Joi.string().required(),
});

// @ts-ignore
type ApiInitializedInProjectProperties = Joi.extractType<
  typeof ApiInitializedInProjectSchema
>;
export const ApiInitializedInProject = DescribeEvent<
  ApiInitializedInProjectProperties
>(
  Events.ApiInitializedInProject,
  ApiInitializedInProjectSchema,
  (props) => `An API called ${props.apiName} was initialized in ${props.cwd}`
);

const ApiCheckCompletedSchema = Joi.any();
export const ApiCheckCompleted = DescribeEvent<CheckAssertionsResult>(
  Events.ApiCheckCompleted,
  ApiCheckCompletedSchema,
  (props) =>
    `API Check for ${props.mode} task: ${props.taskName} ${
      props.passed ? 'passed' : 'failed'
    } `
);
