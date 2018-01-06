/**
* @fileOverview
* Text Input is used in places we need to edit them (like on project info)
* or profile
* To edit a text input and save it, user needs to click on "edit" field
* which toggles, then user can cancel edition or save edition
* when the user cancels it comes back to initial data
*/

import _ from 'lodash'

import { Icon } from '~/components/icon'
import { TooltipGenerator, Tooltip } from '~/components/tooltip'


const RightLabel = ({children, valid}) => (
    <div className="text-input__right-label">
        <Icon name="validated-tick" />

        <span>{children}</span>
    </div>
)

export class TextInput extends React.Component {

    static propTypes = {
        value: PropTypes.string,
        validator: PropTypes.func,
        rightLabel: PropTypes.node,
        textarea: PropTypes.bool,

        // Called with the value and the result of validate()
        onChange: PropTypes.func,

        onBlur: PropTypes.func,
        onFocus: PropTypes.func,

        // Force to display a validation result
        validationResult: PropTypes.object,

        popperOptions: PropTypes.object.isRequired,
    }

    static defaultProps = {
        validator: () => null,
        onChange() {},
        onBlur() {},
        onFocus() {},
        textarea: false,
        popperOptions: {},
    }

    state = {
        value: '', // Not updated if the component is controlled
        rightLabel: '',
        hasBeenEdited: false,
        focused: false,
        input: null,
    }

    // Can be used from exernal code using ref={...}
    get value() {
        return this.state.input.value
    }

    validate() {
        if (!this.state.hasBeenEdited) {
            return null
        }

        const { validator } = this.props
        if (!validator) {
            return null
        }
        return validator(this.value)
    }

    get controlled() {
        return this.props.value !== undefined
    }

    onChange = event => {
        const { value } = event.target

        const propagate = () => {
            const { validator } = this.props
            const validationResult = validator && validator(value)
            this.props.onChange(value, validationResult)
        }

        if (this.controlled) {
            this.setState({
                hasBeenEdited: true,
            })

            return propagate()
        }

        this.setState({
            value,
            hasBeenEdited: true,
        }, propagate)
    }

    get className() {
        const result = this.props.validationResult || this.validate()

        return [
            'text-input',
            result && ('text-input--' + result.level),
        ].filter(v => v).join(' ')
    }

    get inputProps() {
        return _.omit(
            this.props,
            [
                'popperOptions',
                'validator',
                'rightLabel',
                'textarea',
                'validationResult',
                this.props.readOnly && 'autoFocus', // Safari issue on iOS
            ].filter(v => v),
        )
    }

    get validationMessage() {
        const result = this.props.validationResult || this.validate()
        return result ? result.message : ''
    }

    get validationTooltip() {
        const { validationMessage: message } = this
        return message && (
            <Tooltip color="sunrise">
                {message}
            </Tooltip>
        )
    }

    get tooltipVisible() {
        if (this.state.focused) {
            return false
        }

        if (this.props.validationResult) {
            return true
        }

        return !!this.validate()
    }

    onFocus = () => {
        this.setState({focused: true})
        this.props.onFocus()
    }

    onBlur = () => {
        this.setState({focused: false})
        this.props.onBlur()
    }

    onInputMount = input => this.setState({ input })

    componentWillReceiveProps(nextProps) {
        if (nextProps.autoFocus &&
            this.state.input &&
            !nextProps.disabled &&
            !nextProps.readOnly) {
            this.state.input.focus()
        }
    }

    renderInput = () =>
        this.props.textarea ? (
            <textarea {...this.inputProps}
                      onChange={this.onChange}
                      onFocus={this.onFocus}
                      onBlur={this.onBlur}
                      ref={this.onInputMount} />
        ) : (
            <input {...this.inputProps}
                   onChange={this.onChange}
                   onFocus={this.onFocus}
                   onBlur={this.onBlur}
                   ref={this.onInputMount} />
        )

    render() {
        return (
            <div className={this.className}>
                <TooltipGenerator tooltip={this.tooltipVisible &&
                                           this.validationTooltip}
                                  popperOptions={this.props.popperOptions}>

                    <RightLabel>{this.props.rightLabel}</RightLabel>

                    {this.renderInput()}
                </TooltipGenerator>
            </div>
        )
    }
}
