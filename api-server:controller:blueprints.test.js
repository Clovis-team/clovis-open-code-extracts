
const _ = require('lodash')
const { execSync } = require('child_process')
const { assert } = require('chai')
const sinon = require('sinon')

const { User, UserToken, Org, Project, Blueprint, Task } = require('/models')
const { request, createUserAndToken,
        connectSocket, createUserAndRealToken } = require('/test-util')
const { wait } = require('/util')
const fixtures = require('/fixtures/test')

// Skip these tests if not under Slow Tests, they can take a lot of time
const describe_ = process.env.CLOVIS_RUN_SLOW_TESTS ?
                  describe : describe.skip

const { eiffelTower } = fixtures.projects
const { fabien, marcel, antoine } = fixtures.users
const { inFine } = fixtures.orgs

async function waitForConversion(blueprintId) {
    for (;;) {
        const blueprint = await Blueprint.findById(blueprintId)
        if (blueprint.progress === 1) {
            return
        }

        await wait(1000)
    }
}

describe_('blueprint', function () {
    // It's a bit ugly but it's easy.
    let blueprintId

    before(async () => {
        await User.remove()
        await UserToken.remove()
        await Org.remove()
        await Project.remove()
        await Blueprint.remove()

        await createUserAndToken(fabien)
        await createUserAndToken(marcel)
        await Project.create(eiffelTower)
        await Org.create(inFine)
    })


    after(async function () {
        this.timeout(10 * 1000)

        const blueprint = await Blueprint.findById(blueprintId)
        // Run the post remove hooks to removes the files on S3
        // in the case where the last test has failed
        if (blueprint) {
            await blueprint.remove()
        }
    })


    describe('creation', () => {
        let socket
        const picture = __dirname + '/../fixtures/clovis-logo.png'

        after(() => {
            if (socket.connected) {
                socket.disconnect()
            }
        })

        it('fails with a bad file type', async () => {
            await request()
                .post('/projects/id/' + eiffelTower._id + '/blueprints')
                .attach('blueprint', picture)
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(400, { message: 'badMimeType' })
        })

        it('fails with an invalid PDF file', async () => {
            const pdf = '/tmp/bad.pdf'
            execSync('cp ' + picture + ' ' + pdf)

            await request()
                .post('/projects/id/' + eiffelTower._id + '/blueprints')
                .attach('blueprint', pdf)
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(400, { message: 'invalidPdfFile' })
        })

        it('works (slow)', async () => {
            execSync('wget https://isotropic.org/papers/chicken.pdf ' +
                     '-O /tmp/chicken.pdf ' +
                     '--quiet')

            const onNotification = sinon.spy()
            const onProgress = sinon.spy()

            const antoineToken = await createUserAndRealToken(antoine)
            socket = connectSocket(antoineToken,
                socket => {
                    socket.on('notification', onNotification)
                    socket.on('blueprints.progress', onProgress)

                    socket.emit('joinRoom', {
                        name: 'projects/' + eiffelTower._id + '/private',
                    })
                }
            )

            await request()
                .post('/projects/id/' + eiffelTower._id + '/blueprints')
                .attach('blueprint', '/tmp/chicken.pdf')
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(200)
                .expect(({body}) => {
                    assert(body.name === 'chicken'),
                    blueprintId = body._id
                })

            await waitForConversion(blueprintId)

            const blueprint = await Blueprint.findById(blueprintId)
            assert(blueprint.pages.length === 3)
            assert(blueprint.progress === 1)

            assert(onNotification.calledOnce)
            assert.deepEqual(
                _.omit(onNotification.args[0][0], '_id'),
                {
                    type: 'projects.blueprints.create',
                    creator: fabien._id,
                    strong: false,
                    project: eiffelTower._id,
                    blueprint: blueprintId,
                },
            )
        }).timeout(4 * 60 * 1000)
    })


    describe('get list', () => {
        it("doesn't work if I am not a project member", async () => {
            await request()
                .get('/projects/id/' + eiffelTower._id + '/blueprints')
                .set('Authorization', 'Bearer MarcelDupont')
                .expect(403)
        })

        it('works', async () => {
            await request()
                .get('/projects/id/' + eiffelTower._id + '/blueprints')
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(200)
                .expect(({body}) => {
                    assert(body.length === 1)
                    const blueprint = body[0]
                    assert(blueprint.name === 'chicken')
                })
        })
    })


    describe('get by id', () => {
        it('works', async () => {
            await request()
                .get('/blueprints/id/' + blueprintId)
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(200)
                .expect(({body}) => {
                    assert(body.name === 'chicken')
                })
        })
    })


    describe('update', () => {
        it("doesn't change the blueprint when no data is sent", async () => {
            await request()
                .put('/blueprints/id/' + blueprintId)
                .set('Authorization', 'Bearer FabienAucourt')
                .send({})
                .expect(204)

            const blueprint = await Blueprint.findById(blueprintId)
            assert(blueprint.name === 'chicken')
        })

        it('works', async () => {
            await request()
                .put('/blueprints/id/' + blueprintId)
                .set('Authorization', 'Bearer FabienAucourt')
                .send({
                    name: 'rooster',
                })
                .expect(204)

            const blueprint = await Blueprint.findById(blueprintId)
            assert(blueprint.name === 'rooster')
        })
    })


    describe('delete', () => {
        const blueprintToDeleteId = '59c38b54b367bb351056e1a8'

        beforeEach(async () => {
            await Blueprint.remove({ _id: blueprintToDeleteId })

            await Blueprint.create({
                _id: blueprintToDeleteId,
                name: '1-1-0-plan-construction-maison',
                keyPrefix: 'fixtures/plan-maison', // we should make a copy each time
                project: eiffelTower._id,
                progress: 1,
                pages: [
                    {
                        rot: 0,
                        size: {
                            unit: 'pts',
                            height: 299.25,
                            width: 403.5
                        }
                    }
                ],
            })
        })

        it("doesn't work if I am not a project member", async () => {
            await request()
                .delete('/blueprints/id/' + blueprintToDeleteId)
                .set('Authorization', 'Bearer MarcelDupont')
                .expect(403)
        })

        it("doesn't work if at least one task is localized on the blueprint", async () => {
            const task = await Task.create({
                _id: eiffelTower._id + '-66',
                project: eiffelTower._id,
                description: '123',
                locationOnBlueprint: {
                    pageNumber: 1,
                    blueprint: blueprintToDeleteId,
                    x: 308.135810546875,
                    y: 295.6272451171875,
                },
                author: fabien._id,
                number: 66,
                deadline: new Date('2017-09-13T22:00:00Z'),
                files: [ ],
                pictures: [ ],
                commentCount: 0,
                important: false,
                createdAt: new Date('2017-09-07T14:18:44.571Z'),
                seenBy: [ ],
                reviewers: [ ],
                recipients: [ ],
                closed: false,
            })

            await request()
                .delete('/blueprints/id/' + blueprintToDeleteId)
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(409, { message: 'existingRelativeTasks' })

            await Task.remove({ _id: task._id })
        })

        it('works', async () => {
            await request()
                .delete('/blueprints/id/' + blueprintToDeleteId)
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(204)
        })
    })

})

describe('blueprint tasks', () => {
    describe('get list', () => {
        const blueprint1 = {
            _id: '59033f22bf768c002670d7e3',
            name: 'response',
            keyPrefix: '62f2a213552954e37734dee25c44da2af34d1b3107e5aa124582a8b3c0e302f8',
            project: eiffelTower._id,
            progress: 1,
            pages: [
                {
                    rot: 0,
                    size: {
                        unit: 'pts',
                        height: 842,
                        width: 595
                    }
                }
            ],
        }

        const taskCount = 10
        const taskTemplate = {
            description: 'Tache',
            deadline: null,
            locationOnBlueprint: {
                pageNumber: 1,
                blueprint: blueprint1._id,
                x: 105.08984375,
                y: 297.66015625,
            },
            project: eiffelTower._id,
            author: fabien._id,
            files: [ ],
            pictures: [ ],
            commentCount: 0,
            important: false,
            reviewers: [ ],
            recipients: [ ],
            closed: false,
        }

        beforeEach(async () => {
            await Promise.all([
                Org.remove(),
                User.remove(),
                UserToken.remove(),
                Task.remove(),
                Project.remove(),
                Blueprint.remove(),
            ])

            await createUserAndToken(fabien)
            await createUserAndToken(marcel)
            await Project.create(eiffelTower)
            await Org.create(inFine)


            await Blueprint.create(blueprint1)
            await Promise.all(
                _.range(1, taskCount + 1)
                 .map(number => Task.create({
                     ...taskTemplate,
                     _id: eiffelTower._id + '-' + number,
                     number,
                 }))
            )

            await Task.create({
                ..._.omit(taskTemplate, 'locationOnBlueprint'),
                _id: eiffelTower._id + '-' + (taskCount + 1),
                number: taskCount + 1,
            })
        })

        it('works', async () => {
            await request()
                .get('/blueprints/id/' + blueprint1._id + '/tasks')
                .set('Authorization', 'Bearer FabienAucourt')
                .expect(200)
                .expect(({ body: tasks }) => {
                    assert(tasks.length === taskCount)
                    assert(!_.find(tasks, {
                        _id: eiffelTower._id + '-' + (taskCount + 1),
                    }))
                })
        })
    })
})
