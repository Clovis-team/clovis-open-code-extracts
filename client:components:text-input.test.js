
import sinon from 'sinon'
import { shallow, mount } from 'enzyme'
import { assert } from 'chai'

import {
    MockedTooltipMountPoint as TooltipMountPoint
} from '~/components/tooltip/mocked-mount-point'

import { TextInput } from '.'
import { ValidationResult } from './validation'


describe('<TextInput />', () => {
    it('renders an <input> by default', () => {
        const ti = shallow(<TextInput />)
        assert(ti.find('input').length === 1)
        assert(!ti.find('textarea').length)
    })

    it('can render a <textarea>', () => {
        const ti = shallow(<TextInput textarea />)
        assert(!ti.find('input').length)
        assert(ti.find('textarea').length === 1)
    })

    it('transfer props to the underlying <input>', () => {
        const ti = shallow(<TextInput readOnly />)
        assert(ti.find('input').props().readOnly === true)
    })

    it('shows and hides validation errors properly', async () => {
        const validator = () =>
            new ValidationResult('error', 'Error message')

        const wait = () =>
            new Promise(resolve => setTimeout(resolve, 0))

        let tooltipVisible = false

        const tmp = mount(
            <TooltipMountPoint onCreation={id => tooltipVisible = true}
                               onRemoval={() => tooltipVisible = false}>
                <TextInput validator={validator} />
            </TooltipMountPoint>
        )

        const ti = tmp.find('.text-input')

        const input = ti.find('input')

        input.simulate('blur')
        await wait()
        assert(!tooltipVisible)
        input.simulate('focus')
        await wait()
        input.simulate('blur')
        await wait()
        assert(!tooltipVisible)

        input.simulate('change')
        await wait()
        input.simulate('blur')
        await wait()
        assert(tooltipVisible)

        input.simulate('focus')
        await wait()
        assert(!tooltipVisible)

        input.simulate('blur')
        await wait()
        assert(tooltipVisible)
    })

    it('get focused when the autoFocus prop change', () => {
        const ti = mount(<TextInput />)

        const input = ti.state().input
        input.focus = sinon.spy()
        ti.setProps({ autoFocus: true })
        assert(input.focus.calledOnce)
    })

    it("doesn't get focused when readOnly", () => {
        const ti = mount(<TextInput readOnly />)

        const input = ti.state().input
        input.focus = sinon.spy()
        ti.setProps({ autoFocus: true })
        assert(input.focus.notCalled)
    })

    it("doesn't get focused when disabled", () => {
        const ti = mount(<TextInput disabled />)

        const input = ti.state().input
        input.focus = sinon.spy()
        ti.setProps({ autoFocus: true })
        assert(input.focus.notCalled)
    })
})
