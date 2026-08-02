library ieee;
use ieee.std_logic_1164.all;

-- KEY inputs and HEX segments are active-low on this board.
entity button_seven_segment is
  port (
    KEY  : in  std_logic_vector(3 downto 0);
    HEX0 : out std_logic_vector(6 downto 0);
    LEDG : out std_logic_vector(7 downto 0)
  );
end entity;

architecture combinational of button_seven_segment is
begin
  process (KEY)
  begin
    LEDG <= (others => '0');
    if KEY(0) = '0' then
      HEX0 <= "1111001"; -- 1
      LEDG(0) <= '1';
    elsif KEY(1) = '0' then
      HEX0 <= "0100100"; -- 2
      LEDG(1) <= '1';
    elsif KEY(2) = '0' then
      HEX0 <= "0110000"; -- 3
      LEDG(2) <= '1';
    elsif KEY(3) = '0' then
      HEX0 <= "0011001"; -- 4
      LEDG(3) <= '1';
    else
      HEX0 <= "1000000"; -- 0
    end if;
  end process;
end architecture;
