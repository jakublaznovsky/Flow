import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Markdownish from './Markdownish'

describe('Markdownish', () => {
  it('renders headings, lists, paragraphs and bold', () => {
    const { container } = render(<Markdownish text={'# Title\n\nSome **bold** text\n\n- a\n- b\n\n1. one\n2. two'} />)
    expect(container.querySelector('h3')?.textContent).toBe('Title')
    expect(container.querySelector('p strong')?.textContent).toBe('bold')
    expect([...container.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(['a', 'b'])
    expect([...container.querySelectorAll('ol li')].map((li) => li.textContent)).toEqual(['one', 'two'])
  })

  it('shows HTML as literal text, never as markup', () => {
    const html = '<img src=x onerror=alert(1)>'
    const { container } = render(<Markdownish text={`${html}\n\n- **<b>hi</b>**`} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('p')?.textContent).toBe(html)
    expect(container.querySelector('li strong')?.textContent).toBe('<b>hi</b>')
  })
})
