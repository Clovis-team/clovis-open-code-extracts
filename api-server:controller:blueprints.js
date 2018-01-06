
const _ = require('lodash')
const validate = require('../validate')
const router = require('koa-router')()
const { Blueprint, Project, Task } = require('../models')
const { idParamHandler } = require('./helpers')

async function requireProjectMembership(ctx, next) {
    const project = await Project.findById(ctx.blueprint.project)
    if (!await project.getMemberType(ctx.me)) {
        ctx.throw(403)
    }

    await next()
}

const tasksRouter = require('koa-router')()

tasksRouter

    /**
     *  @swagger
     *   /blueprints/id/{id}/tasks:
     *     get:
     *       summary: Returns an array of tasks which are localized on the blueprint.
     *       tags:
     *         - blueprint
     *       parameters:
     *         - name: id
     *           in: path
     *           description: The blueprint id
     *           required: true
     *           type: string
     *       produces:
     *         - application/json
     *       responses:
     *         '200':
     *           description: successful operation
     *           schema:
     *             type: array
     *             items:
     *               $ref: '#/definitions/Task'
     */
    .get('/', async ctx => {
        const tasks = await Task.find({
            'locationOnBlueprint.blueprint': ctx.blueprint._id,
        })

        ctx.body = tasks.map(t => t.export())
    })


router
    .param('id', idParamHandler(Blueprint))

    /**
     *  @swagger
     *   /blueprints/id/{id}:
     *     get:
     *       summary: Get the blueprint document.
     *       tags:
     *         - blueprint
     *       parameters:
     *         - name: id
     *           in: path
     *           description: The blueprint id
     *           required: true
     *           type: string
     *       produces:
     *         - application/json
     *       responses:
     *         '200':
     *           description: successful operation
     *           schema:
     *             $ref: '#/definitions/Blueprint'
     */
    .get('/id/:id', requireProjectMembership, async ctx => {
        ctx.body = ctx.blueprint.export()
    })


    /**
     *  @swagger
     *   /blueprints/id/{id}:
     *     put:
     *       summary: Update the name of the blueprint.
     *       tags:
     *         - blueprint
     *       parameters:
     *         - name: id
     *           in: path
     *           description: The blueprint id
     *           required: true
     *           type: string
     *         - name: body
     *           in: body
     *           required: true
     *           schema:
     *             type: object
     *             properties:
     *               name:
     *                 type: string
     *       produces:
     *         - application/json
     *       responses:
     *         '204':
     *           description: The blueprint was updated successfully

     */
    .put('/id/:id', requireProjectMembership, async ctx => {
        const schema = {
            name: String,
        }

        const body = validate(
            ctx.request.body,
            _.mapValues(schema, type => ({ type, optional: true })),
        )

        await ctx.blueprint.update(body)

        ctx.status = 204
    })


    /**
     *  @swagger
     *   /blueprints/id/{id}:
     *     delete:
     *       summary: Delete the blueprint in the database and in the S3 bucket.
     *       tags:
     *         - blueprint
     *       parameters:
     *         - name: id
     *           in: path
     *           description: The blueprint id
     *           required: true
     *           type: string
     *       produces:
     *         - application/json
     *       responses:
     *         '204':
     *           description: The blueprint was deleted successfully
     */
    .delete('/id/:id', requireProjectMembership, async ctx => {
        const { blueprint } = ctx

        const relatedTasks = await Task.find({
            'locationOnBlueprint.blueprint': blueprint._id,
        })

        if (relatedTasks.length > 0) {
            ctx.throw('existingRelativeTasks', 409)
        }

        blueprint.deleted = true
        await blueprint.save()

        ctx.status = 204
    })

    .use('/id/:id/tasks', requireProjectMembership, tasksRouter.routes())

module.exports = router.routes()
